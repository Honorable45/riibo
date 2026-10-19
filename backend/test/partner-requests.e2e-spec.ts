import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './utils/test-app';
import { createTestPrisma, resetDatabase } from './utils/test-db';
import { registerTestUser, TestUser } from './utils/test-users';

describe('Demandes de partenariat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: TestUser;
  let regular: TestUser;

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    app = await createTestApp();
    admin = await registerTestUser(app, { username: 'admin_partners' });
    regular = await registerTestUser(app, { username: 'regular_partners' });
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const body = {
    restaurantName: 'Le Maquis du Port',
    contactName: 'Kodjo A.',
    phone: '91 22 33 44',
    area: 'Lomé, Port',
  };

  it('un visiteur sans compte envoie une demande, enregistrée en base', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/partner-requests')
      .send(body)
      .expect(201);
    expect(Object.keys(res.body).sort()).toEqual(['id', 'receivedAt']);
    const saved = await prisma.partnerRequest.findUnique({ where: { id: res.body.id as string } });
    expect(saved).toMatchObject({ phone: '+22891223344', status: 'NEW' });
  });

  it('refuse les doublons, les champs invalides et le champ piège', async () => {
    await request(app.getHttpServer()).post('/api/v1/partner-requests').send(body).expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/partner-requests')
      .send({ ...body, phone: 'abc' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/partner-requests')
      .send({ ...body, phone: '92000000', website: 'x' })
      .expect(400);
  });

  it('seul un admin lit et traite les demandes', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/partner-requests').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/partner-requests')
      .set('Authorization', `Bearer ${regular.accessToken}`)
      .expect(403);
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/partner-requests')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const id = (list.body.items as Array<{ id: string }>)[0].id;
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/partner-requests/${id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'CONTACTED', internalNote: 'Rappelé, rendez-vous lundi' })
      .expect(200);
    expect(
      await prisma.auditLog.count({ where: { action: 'PARTNER_REQUEST_UPDATED', targetId: id } }),
    ).toBe(1);
  });
});
