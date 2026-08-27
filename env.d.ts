declare namespace Cloudflare {
  interface Env {
    FILES: R2Bucket;
    DB: D1Database;
    PLENTY_BASE_URL?: string;
    PLENTY_USERNAME?: string;
    PLENTY_PASSWORD?: string;
    OPENAI_API_KEY?: string;
    GOOGLE_MAPS_API_KEY?: string;
    MIFRRO_ORIGIN_ADDRESS?: string;
    GOOGLE_SCRIPT_MAIL_URL?: string;
    MAIL_RELAY_SECRET?: string;
    RESEND_API_KEY?: string;
    MAIL_FROM?: string;
    MAIL_CC?: string;
    STAFF_AUTH_SECRET?: string;
    STAFF_ADMIN_PIN?: string;
  }
}
