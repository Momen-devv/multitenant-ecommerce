export abstract class StorageService {
  abstract uploadFile(
    file: Express.Multer.File,
    destinationPath: string,
  ): Promise<string>;
  abstract deleteFile(filePath: string): Promise<void>;
}
