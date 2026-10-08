# Storage

`StorageModule` exports `StorageService`, implemented by `AwsS3StorageService`. It uploads file buffers, deletes objects by key, and returns object URLs.

## Configuration

Set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`, and `AWS_ENDPOINT`. The S3 client always uses the configured endpoint, explicit credentials, and path-style addressing.

For the included LocalStack service:

```dotenv
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_S3_BUCKET_NAME=ecommerce
AWS_ENDPOINT=http://localhost:4566
```

At startup, the service checks bucket access. It creates the bucket on a `NotFound` error and propagates other errors. Configure bucket permissions and availability before starting the application.

## Usage

Import `StorageModule` and inject `StorageService`. `uploadFile(file, destinationPath)` expects an in-memory Multer file and an object key. `deleteFile(filePath)` expects an object key, not the URL returned by upload.

Non-production uploads return `<AWS_ENDPOINT>/<bucket>/<key>`. Production uploads return the AWS regional bucket URL. Uploading does not configure public access or issue a signed URL; object access must match the bucket's policy and serving setup.

## Upload validation

`multer.config.ts` uses memory storage. Profile images and Store logos have 5 MiB limits; Product Images have a 5 MiB per-file limit and a maximum of ten files per upload.

`createImageFileValidator` supports required/optional files, a caller-provided size limit, and JPEG, PNG, or WebP validation by default. Validation failures return HTTP 422. Feature controllers select the relevant upload options and validators.

Use the [resource cleanup queue](../queue/README.md) for asynchronous deletion of replaced or orphaned objects.
