import "dotenv/config";

// Locally this comes from .env via dotenv; in a deploy it has to be a real
// environment variable, since there is no .env file in the image.
const url = process.env.DATABASE_URL;

if (!url) {
  // Prisma's own message for this is "The datasource.url property is required
  // in your Prisma config file", which points at this file when the actual
  // problem is the missing variable. Say so plainly instead.
  throw new Error(
    "DATABASE_URL is not set, so Prisma has no database to connect to.\n" +
      "  Locally:    copy .env.example to .env and fill it in.\n" +
      "  On Railway: set DATABASE_URL on the app service to ${{Postgres.DATABASE_URL}},\n" +
      "              where 'Postgres' must match your database service's actual name."
  );
}

export default {
  datasource: { url },
};
