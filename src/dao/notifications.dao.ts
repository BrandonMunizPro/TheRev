import { AppDataSource } from '../data-source';
import { Notification } from '../entities/Notification';
import { NotificationStatus } from '../graphql/enums/NotificationType';
import { Repository } from 'typeorm';
import { ErrorHandler } from '../errors/ErrorHandler';

export class NotificationsDao {
  private get repo(): Repository<Notification> {
    return AppDataSource.getRepository(Notification);
  }

  async findById(id: string): Promise<Notification | null> {
    return this.repo.findOne({
      where: { id },
      relations: ['user', 'actor'],
    });
  }

  async create(data: {
    userId: string;
    type: Notification['type'];
    title: string;
    message: string;
    referenceId?: string;
    referenceType?: string;
    actorId?: string;
  }): Promise<Notification> {
    const notification = this.repo.create({
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      referenceId: data.referenceId,
      referenceType: data.referenceType,
      actorId: data.actorId,
      status: NotificationStatus.UNREAD,
    });

    return this.repo.save(notification);
  }

  async getByUserId(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Notification[]> {
    return this.repo
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.actor', 'actor')
      .where('notification.userId = :userId', { userId })
      .orderBy('notification.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.status = :status', {
        status: NotificationStatus.UNREAD,
      })
      .getCount();
    return result;
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.repo.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw ErrorHandler.notFound('Notification', 'Notification not found');
    }

    notification.status = NotificationStatus.READ;
    return this.repo.save(notification);
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('notification')
      .update(Notification)
      .set({ status: NotificationStatus.READ })
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.status = :status', {
        status: NotificationStatus.UNREAD,
      })
      .execute();

    return result.affected || 0;
  }

  async dismiss(id: string, userId: string): Promise<Notification> {
    const notification = await this.repo.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw ErrorHandler.notFound('Notification', 'Notification not found');
    }

    notification.status = NotificationStatus.DISMISSED;
    return this.repo.save(notification);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.repo.delete({ id, userId });
    return result.affected === 1;
  }

  async deleteAllForUser(userId: string): Promise<number> {
    const result = await this.repo.delete({ userId });
    return result.affected || 0;
  }
}
