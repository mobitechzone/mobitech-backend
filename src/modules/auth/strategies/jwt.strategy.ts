import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret', 'dev-secret'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { permission: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account not found or deactivated');
    }
    const { password, ...safeUser } = user;
    return {
      ...safeUser,
      permissions: user.permission ?? {
        canDiscount: false,
        canCustomPrice: false,
        canRefund: false,
        canEditOwnRepairs: true,
        canViewProfit: true,
        canHoldSale: true,
        canDeleteSale: false,
      },
    };
  }
}
