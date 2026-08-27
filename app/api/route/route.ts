import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { MIFRRO_ORIGIN_ADDRESS } from '../../../lib/routing';
import { getStaffUser } from '../../staff-auth';

type RouteResult = { routes?: Array<{ distanceMeters?: number; duration?: string }> };
type Coordinate = { latitude: number; longitude: number };
type GeocodeResult = Coordinate & { postalCode?: string };
type NominatimResult = Array<{ lat?: string; lon?: string; address?: { postcode?: string } }>;
type OsrmResult = { code?: string; routes?: Array<{ distance?: number; duration?: number }> };

const geocodeCache = new Map<string, GeocodeResult>();
let lastNominatimRequestAt = 0;

function extractPostalCode(address: string, explicitPostalCode = '') {
  return explicitPostalCode.match(/\b\d{5}\b/)?.[0] ?? address.match(/\b\d{5}\b/)?.[0] ?? '';
}

async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const cacheKey = address.toLocaleLowerCase('de').trim();
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  const waitMs = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'de');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('q', address);
  lastNominatimRequestAt = Date.now();
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'accept-language': 'de',
      'user-agent': 'Mifrro-Arbeitsnachweis/1.0 (+https://www.smartklimatisieren.de)',
    },
  });
  if (!response.ok) throw new Error(`Adresse konnte nicht gefunden werden (HTTP ${response.status}).`);
  const first = ((await response.json()) as NominatimResult)[0];
  const coordinate = { latitude: Number(first?.lat), longitude: Number(first?.lon), postalCode: first?.address?.postcode };
  if (!Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude)) throw new Error(`Adresse nicht gefunden: ${address}`);
  geocodeCache.set(cacheKey, coordinate);
  return coordinate;
}

async function computeOsrmRoundTrip(origin: Coordinate, destination: Coordinate) {
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude};${origin.longitude},${origin.latitude}`;
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false&steps=false`, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mifrro-Arbeitsnachweis/1.0 (+https://www.smartklimatisieren.de)',
      referer: 'https://www.smartklimatisieren.de/',
    },
  });
  if (!response.ok) throw new Error(`Fahrstrecke konnte nicht berechnet werden (HTTP ${response.status}).`);
  const payload = await response.json() as OsrmResult;
  const route = payload.routes?.[0];
  if (payload.code !== 'Ok' || !route?.distance || !route.duration) throw new Error('Für diese Adressen wurde keine Fahrstrecke gefunden.');
  return { distance: route.distance, duration: route.duration };
}

async function computeOpenRoute(originAddress: string, destinationAddress: string, explicitPostalCode = '') {
  const origin = await geocodeAddress(originAddress);
  const postalCode = extractPostalCode(destinationAddress, explicitPostalCode);
  let destination: GeocodeResult;
  let usedPostalCodeCenter = false;

  try {
    destination = await geocodeAddress(destinationAddress);
    if (postalCode && destination.postalCode && !destination.postalCode.includes(postalCode)) {
      throw new Error('Die gefundene Adresse liegt in einer anderen Postleitzahl.');
    }
  } catch (error) {
    if (!postalCode) throw error;
    destination = await geocodeAddress(`${postalCode}, Deutschland`);
    usedPostalCodeCenter = true;
  }

  let route;
  try {
    route = await computeOsrmRoundTrip(origin, destination);
  } catch (error) {
    if (!postalCode || usedPostalCodeCenter) throw error;
    destination = await geocodeAddress(`${postalCode}, Deutschland`);
    usedPostalCodeCenter = true;
    route = await computeOsrmRoundTrip(origin, destination);
  }
  return {
    distanceKm: Math.round(route.distance / 100) / 10,
    driveMinutes: Math.round(route.duration / 60),
    provider: 'OpenStreetMap/OSRM',
    usedPostalCodeCenter,
    postalCode: usedPostalCodeCenter ? postalCode : undefined,
  };
}

async function computeRoute(apiKey: string, origin: string, destination: string) {
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({
      origin: { address: origin },
      destination: { address: destination },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      languageCode: 'de-DE',
      units: 'METRIC',
    }),
  });
  if (!response.ok) throw new Error(`Routenberechnung fehlgeschlagen (HTTP ${response.status}).`);
  const payload = await response.json() as RouteResult;
  const route = payload.routes?.[0];
  if (!route?.distanceMeters || !route.duration) throw new Error('Google Maps hat keine verwendbare Route geliefert.');
  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: Number.parseFloat(route.duration.replace('s', '')),
  };
}

export async function POST(request: Request) {
  if (!await getStaffUser()) return NextResponse.json({ error: 'Bitte zuerst anmelden.' }, { status: 401 });
  try {
    const { address, postalCode } = await request.json() as { address?: string; postalCode?: string };
    const destination = String(address ?? '').trim();
    if (!destination) throw new Error('Die Einsatzadresse fehlt.');
    const origin = MIFRRO_ORIGIN_ADDRESS;
    const apiKey = String(env.GOOGLE_MAPS_API_KEY ?? '').trim();
    if (apiKey) {
      try {
        const [outbound, inbound] = await Promise.all([
          computeRoute(apiKey, origin, destination),
          computeRoute(apiKey, destination, origin),
        ]);
        const distanceKm = Math.round((outbound.distanceMeters + inbound.distanceMeters) / 100) / 10;
        const driveMinutes = Math.round((outbound.durationSeconds + inbound.durationSeconds) / 60);
        return NextResponse.json({ origin, destination, distanceKm, driveMinutes, provider: 'Google Maps' });
      } catch {
        // Bei einem nicht nutzbaren Google-Schlüssel wird automatisch die offene Route verwendet.
      }
    }
    const fallback = await computeOpenRoute(origin, destination, String(postalCode ?? ''));
    return NextResponse.json({ origin, destination, ...fallback });
  } catch (error) {
    return NextResponse.json(
      { error: `${error instanceof Error ? error.message : 'Routenberechnung fehlgeschlagen.'} Kilometer und Fahrzeit können weiterhin manuell eingetragen werden.` },
      { status: 422 },
    );
  }
}
