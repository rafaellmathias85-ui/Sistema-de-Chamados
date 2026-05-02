import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client, getBucketConfig } from "./aws-config";

const s3Client = createS3Client();

export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  isPublic: boolean = false
): Promise<{ uploadUrl: string; cloudStoragePath: string }> {
  const { bucketName, folderPrefix } = getBucketConfig();
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const cloudStoragePath = isPublic
    ? `${folderPrefix}public/uploads/${timestamp}-${sanitizedFileName}`
    : `${folderPrefix}uploads/${timestamp}-${sanitizedFileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: cloudStoragePath,
    ContentType: contentType,
    ContentDisposition: isPublic ? "attachment" : undefined,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  return { uploadUrl, cloudStoragePath };
}

export async function initiateMultipartUpload(
  fileName: string,
  isPublic: boolean = false
): Promise<{ uploadId: string; cloudStoragePath: string }> {
  const { bucketName, folderPrefix } = getBucketConfig();
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const cloudStoragePath = isPublic
    ? `${folderPrefix}public/uploads/${timestamp}-${sanitizedFileName}`
    : `${folderPrefix}uploads/${timestamp}-${sanitizedFileName}`;

  const command = new CreateMultipartUploadCommand({
    Bucket: bucketName,
    Key: cloudStoragePath,
    ContentDisposition: isPublic ? "attachment" : undefined,
  });

  const response = await s3Client.send(command);

  return {
    uploadId: response.UploadId!,
    cloudStoragePath,
  };
}

export async function getPresignedUrlForPart(
  cloudStoragePath: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  const { bucketName } = getBucketConfig();

  const command = new UploadPartCommand({
    Bucket: bucketName,
    Key: cloudStoragePath,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function completeMultipartUpload(
  cloudStoragePath: string,
  uploadId: string,
  parts: Array<{ ETag: string; PartNumber: number }>
): Promise<void> {
  const { bucketName } = getBucketConfig();

  const command = new CompleteMultipartUploadCommand({
    Bucket: bucketName,
    Key: cloudStoragePath,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  });

  await s3Client.send(command);
}

export async function getFileUrl(
  cloudStoragePath: string,
  isPublic: boolean = false
): Promise<string> {
  const { bucketName, region } = getBucketConfig();

  if (isPublic) {
    return `https://${bucketName}.s3.${region}.amazonaws.com/${cloudStoragePath}`;
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: cloudStoragePath,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function deleteFile(cloudStoragePath: string): Promise<void> {
  const { bucketName } = getBucketConfig();

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: cloudStoragePath,
  });

  await s3Client.send(command);
}
