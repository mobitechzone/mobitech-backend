import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { randomBytes } from 'crypto';

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  generateTrackingToken(): string {
    return randomBytes(8).toString('hex');
  }

  async getRepairByToken(token: string) {
    const repair = await this.prisma.repair.findUnique({
      where: { trackingToken: token },
      select: {
        id: true,
        repairNumber: true,
        trackingToken: true,
        deviceType: true,
        brand: true,
        model: true,
        problemDescription: true,
        diagnosis: true,
        status: true,
        dateReceived: true,
        estimatedFinish: true,
        completionDate: true,
        customerName: true,
        technician: { select: { name: true } },
        timeline: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            status: true,
            note: true,
            createdAt: true,
          },
        },
        parts: {
          select: {
            id: true,
            name: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
        },
      },
    });

    if (!repair) {
      throw new NotFoundException('Repair not found');
    }

    return {
      repairNumber: repair.repairNumber,
      deviceType: repair.deviceType,
      brand: repair.brand,
      model: repair.model,
      problemDescription: repair.problemDescription,
      diagnosis: repair.diagnosis,
      status: repair.status,
      dateReceived: repair.dateReceived,
      estimatedFinish: repair.estimatedFinish,
      completionDate: repair.completionDate,
      customerName: repair.customerName,
      technicianName: repair.technician?.name || null,
      timeline: repair.timeline,
      parts: repair.parts,
    };
  }

  async getChatMessages(repairId: string) {
    const repair = await this.prisma.repair.findFirst({
      where: { trackingToken: repairId },
      select: { id: true },
    });

    if (!repair) {
      throw new NotFoundException('Repair not found');
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: { repairId: repair.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        sender: true,
        message: true,
        createdAt: true,
      },
    });

    return messages;
  }

  async sendChatMessage(token: string, sender: string, message: string) {
    const repair = await this.prisma.repair.findFirst({
      where: { trackingToken: token },
      select: { id: true },
    });

    if (!repair) {
      throw new NotFoundException('Repair not found');
    }

    if (!message || message.trim().length === 0) {
      throw new BadRequestException('Message cannot be empty');
    }

    if (message.length > 2000) {
      throw new BadRequestException('Message too long (max 2000 characters)');
    }

    const chatMessage = await this.prisma.chatMessage.create({
      data: {
        repairId: repair.id,
        sender: sender || 'Customer',
        message: message.trim(),
      },
      select: {
        id: true,
        sender: true,
        message: true,
        createdAt: true,
      },
    });

    // Create notification for technicians
    try {
      const repairInfo = await this.prisma.repair.findUnique({
        where: { id: repair.id },
        select: { repairNumber: true, customerName: true },
      });
      await this.notifications.create({
        type: 'CHAT_MESSAGE',
        title: 'New message from customer',
        message: `${repairInfo?.customerName || 'Customer'} sent a message on ${repairInfo?.repairNumber || 'repair'}`,
        entity: 'REPAIR',
        entityId: repair.id,
      });
    } catch (err) {
      this.logger.error(`Failed to create chat notification: ${err}`);
    }

    return chatMessage;
  }
}
