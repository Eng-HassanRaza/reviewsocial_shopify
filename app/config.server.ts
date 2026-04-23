const REQUIRED_ENV_VARS = [
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "AWS_S3_BUCKET",
  "CRON_SECRET",
] as const;

export function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `[SocialRevu] Missing required environment variables:\n  ${missing.join("\n  ")}\n` +
      `App will start but affected features will fail until these are configured.`
    );
  }
}
