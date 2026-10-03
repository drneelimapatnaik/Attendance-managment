/**
 * Staff module: /api/v1/staff.
 *
 * Imports AuthModule for the invitation machinery (OtpService mints the single-use
 * link, MAIL_SENDER delivers it) and RolesModule for the role rules an invite or a
 * role change must respect.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { RolesModule } from '@/roles/roles.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [AuthModule, RolesModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
