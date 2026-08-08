import { Module } from '@nestjs/common';
import { StoresController } from './controllers/stores.controller';
import { StoresService } from './services/stores.service';

@Module({
  controllers: [StoresController],
  providers: [StoresService],
})
export class StoresModule {}
