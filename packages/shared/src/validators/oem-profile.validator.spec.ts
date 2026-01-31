import { registerOemSchema, loginSchema } from './oem-profile.validator';

describe('registerOemSchema', () => {
  const validRegistration = {
    email: 'oem@example.com',
    password: 'StrongP@ss1',
    confirmPassword: 'StrongP@ss1',
    firstName: 'Rajesh',
    lastName: 'Kumar',
  };

  it('should accept a valid registration', () => {
    const result = registerOemSchema.safeParse(validRegistration);
    expect(result.success).toBe(true);
  });

  it('should accept valid registration with optional phone', () => {
    const result = registerOemSchema.safeParse({
      ...validRegistration,
      phone: '9876543210',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = registerOemSchema.safeParse({
      ...validRegistration,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty email', () => {
    const result = registerOemSchema.safeParse({
      ...validRegistration,
      email: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password (no uppercase)', () => {
    const result = registerOemSchema.safeParse({
      ...validRegistration,
      password: 'weakpass@1',
      confirmPassword: 'weakpass@1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password (no lowercase)', () => {
    const result = registerOemSchema.safeParse({
      ...validRegistration,
      password: 'WEAKPASS@1',
      confirmPassword: 'WEAKPASS@1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password (no number)', () => {
    const result = registerOemSchema.safeParse({
      ...validRegistration,
      password: 'WeakPass@abc',
      confirmPassword: 'WeakPass@abc',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password (no special character)', () => {
    const result = registerOemSchema.safeParse({
      ...validRegistration,
      password: 'WeakPass1abc',
      confirmPassword: 'WeakPass1abc',
    });
    expect(result.success).toBe(false);
  });

  it('should reject password shorter than 8 characters', () => {
    const result = registerOemSchema.safeParse({
      ...validRegistration,
      password: 'Sh@1',
      confirmPassword: 'Sh@1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject mismatched passwords', () => {
    const result = registerOemSchema.safeParse({
      ...validRegistration,
      password: 'StrongP@ss1',
      confirmPassword: 'DifferentP@ss2',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmError = result.error.issues.find((i) => i.path.includes('confirmPassword'));
      expect(confirmError?.message).toBe('Passwords do not match');
    }
  });

  it('should reject missing firstName', () => {
    const { firstName, ...rest } = validRegistration;
    const result = registerOemSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing lastName', () => {
    const { lastName, ...rest } = validRegistration;
    const result = registerOemSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject first name shorter than 2 characters', () => {
    const result = registerOemSchema.safeParse({ ...validRegistration, firstName: 'A' });
    expect(result.success).toBe(false);
  });

  it('should reject phone number shorter than 10 characters', () => {
    const result = registerOemSchema.safeParse({ ...validRegistration, phone: '12345' });
    expect(result.success).toBe(false);
  });

  it('should reject phone number longer than 15 characters', () => {
    const result = registerOemSchema.safeParse({ ...validRegistration, phone: '1234567890123456' });
    expect(result.success).toBe(false);
  });

  it('should accept a valid complex password', () => {
    const result = registerOemSchema.safeParse({
      ...validRegistration,
      password: 'C0mplex!Pass',
      confirmPassword: 'C0mplex!Pass',
    });
    expect(result.success).toBe(true);
  });
});

describe('loginSchema', () => {
  it('should accept valid login credentials', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'anyPassword',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'invalid',
      password: 'password',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing email', () => {
    const result = loginSchema.safeParse({ password: 'password' });
    expect(result.success).toBe(false);
  });

  it('should reject missing password', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(false);
  });

  it('should reject empty password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  it('should accept any non-empty password (no strength requirement)', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'a',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty object', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
