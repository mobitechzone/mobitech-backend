import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';

@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService) {}

  uploadDir() {
    return join(process.cwd(), 'uploads');
  }

  publicUrl(filename: string) {
    const port = this.config.get<number>('PORT', 4000);
    return `http://localhost:${port}/uploads/${filename}`;
  }
}
