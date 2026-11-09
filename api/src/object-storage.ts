import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function configureObjectStorage() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_MEDIA_BUCKET, R2_RECEIPTS_BUCKET, R2_MEDIA_ORIGIN } = process.env;
  const values = [R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_MEDIA_BUCKET, R2_RECEIPTS_BUCKET, R2_MEDIA_ORIGIN];
  if (!values.some(Boolean)) return null;
  if (!R2_ACCOUNT_ID || !/^[a-f0-9]{32}$/i.test(R2_ACCOUNT_ID) || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY ||
      !R2_MEDIA_BUCKET || !R2_RECEIPTS_BUCKET || R2_MEDIA_BUCKET === R2_RECEIPTS_BUCKET || !R2_MEDIA_ORIGIN) {
    throw new Error("Configure all R2 settings and use distinct media and receipt buckets");
  }
  const origin = new URL(R2_MEDIA_ORIGIN);
  if (origin.protocol !== "https:" || origin.href !== origin.origin + "/") throw new Error("R2_MEDIA_ORIGIN must be an HTTPS origin");
  const client = new S3Client({
    region: "auto",
    endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const object = (kind: "media" | "receipt", key: string) => ({
    Bucket: kind === "media" ? R2_MEDIA_BUCKET : R2_RECEIPTS_BUCKET, Key: key,
  });
  return {
    mediaOrigin: origin.origin,
    put(kind: "media" | "receipt", key: string, body: Buffer, contentType: string) {
      return client.send(new PutObjectCommand({
        ...object(kind, key), Body: body, ContentType: contentType,
        CacheControl: kind === "media" ? "public, max-age=31536000, immutable" : "private, no-store",
      }), { abortSignal: AbortSignal.timeout(15000) });
    },
    async exists(kind: "media" | "receipt", key: string) {
      try {
        await client.send(new HeadObjectCommand(object(kind, key)), { abortSignal: AbortSignal.timeout(5000) });
        return true;
      } catch (error) {
        if (error instanceof Error && ["NotFound", "NoSuchKey"].includes(error.name)) return false;
        throw error;
      }
    },
    removeReceipt(key: string) {
      return client.send(new DeleteObjectCommand(object("receipt", key)), { abortSignal: AbortSignal.timeout(5000) });
    },
    receiptUrl(key: string) {
      return getSignedUrl(client, new GetObjectCommand(object("receipt", key)), { expiresIn: 60 });
    },
  };
}
export type ObjectStorage = ReturnType<typeof configureObjectStorage>;
