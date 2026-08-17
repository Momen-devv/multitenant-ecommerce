import { Injectable } from '@nestjs/common';
import { PlansRepository } from '../repos/plans.repository';

@Injectable()
export class PlansService {
  constructor(private readonly plansRepository: PlansRepository) {}
}
