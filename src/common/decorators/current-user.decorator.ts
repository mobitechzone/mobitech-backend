import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';

export interface AuthUser extends User {
  permissions?: {
    canDiscount: boolean;
    canCustomPrice: boolean;
    canRefund: boolean;
    canEditOwnRepairs: boolean;
    canViewProfit: boolean;
    canHoldSale: boolean;
    canDeleteSale: boolean;
  };
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | AuthUser[keyof AuthUser] => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthUser;
    return data ? user?.[data] : user;
  },
);
