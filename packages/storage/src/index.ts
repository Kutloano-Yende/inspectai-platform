import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * S3-compatible storage abstraction (S3, MinIO). All buckets are private:
 * objects are written/read only through this client, and downloads are exposed
 * exclusively as short-lived presigned GETs issued after authorization checks.
 * There is no method that produces a public URL — by construction.
 */
export class S3Storage {
  private readonly client: S3Client;

  constructor(config: StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true, // MinIO-style path addressing; works for AWS S3 too
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err) {
      if ((err as { name?: string }).name === "NotFound") return false;
      throw err;
    }
  }

  async getObjectBuffer(bucket: string, key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) throw new Error(`Object ${bucket}/${key} has no body`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  /** Short-lived presigned PUT for direct-to-storage uploads (evidence flow). */
  async presignPut(bucket: string, key: string, contentType: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Short-lived presigned GET; callers must enforce authorization before invoking. */
  async presignGet(bucket: string, key: string, expiresInSeconds = 60): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
