import { Global, Module } from "@nestjs/common";
import { S3Storage } from "@inspectai/storage";
import { STORAGE } from "./tokens.js";

@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      useFactory: () =>
        new S3Storage({
          endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
          region: process.env.S3_REGION ?? "us-east-1",
          accessKeyId: process.env.S3_ACCESS_KEY ?? "",
          secretAccessKey: process.env.S3_SECRET_KEY ?? "",
        }),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
