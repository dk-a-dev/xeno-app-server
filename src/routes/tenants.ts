import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const tenantsRouter = Router();

tenantsRouter.post('/', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const existing = await prisma.tenant.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const tenant = await prisma.tenant.create({ data: { name, email, passwordHash: hash } });
  return res.status(201).json({ id: tenant.id, name: tenant.name, email: tenant.email });
});

// Login
tenantsRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const tenant = await prisma.tenant.findUnique({ where: { email } });
  if (!tenant) return res.status(401).json({ error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, tenant.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign(
    { tenantId: tenant.id, userId: tenant.id, email: tenant.email },
    env.JWT_SECRET,
    { expiresIn: `${env.JWT_EXP_HOURS}h` }
  );
  return res.json({ token });
});
