import { registerOemSchema, loginSchema } from './oem-profile.validator';

// ---------------------------------------------------------------------------
// registerOemSchema
// ---------------------------------------------------------------------------

describe('registerOemSchema', () => {
  const validRegistration = {
    email: 'oem@example.com',
    password: 'StrongP@ss1',
    confirmPassword: 'StrongP@ss1',
    firstName: 'Rajesh',
    lastName: 'Kumar',
  };

  // -- happy path -----------------------------------------------------------

  it('should accept a valid registration', () => {
    expect(registerOemSchema.safeParse(validRegistration).success).toBe(true);
  });

  it('should accept registration with optional phone', () => {
    expect(registerOemSchema.safeParse({ ...validRegistration, phone: '9876543210' }).success).toBe(true);
  });

  it('should accept a complex valid password', () => {
    expect(
      registerOemSchema.safeParse({
        ...validRegistration,
        password: 'C0mplex!Pass',
        confirmPassword: 'C0mplex!Pass',
      }).success,
    ).toBe(true);
  });

  // -- email ----------------------------------------------------------------

  describe('email', () => {
    it('should accept standard email', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, email: 'test@example.com' }).success).toBe(true);
    });

    it('should accept email with subdomain', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, email: 'user@mail.example.co.in' }).success).toBe(true);
    });

    it('should reject invalid email (no @)', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, email: 'not-an-email' }).success).toBe(false);
    });

    it('should reject empty email', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, email: '' }).success).toBe(false);
    });

    it('should reject whitespace-only email', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, email: '   ' }).success).toBe(false);
    });

    it('should reject email without domain', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, email: 'user@' }).success).toBe(false);
    });

    it('should reject email without user part', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, email: '@example.com' }).success).toBe(false);
    });

    it('should reject missing email', () => {
      const { email, ...rest } = validRegistration;
      expect(registerOemSchema.safeParse(rest).success).toBe(false);
    });
  });

  // -- password strength ----------------------------------------------------

  describe('password', () => {
    it('should reject password shorter than 8 characters', () => {
      expect(
        registerOemSchema.safeParse({
          ...validRegistration,
          password: 'Sh@1',
          confirmPassword: 'Sh@1',
        }).success,
      ).toBe(false);
    });

    it('should accept exactly 8 character password meeting all requirements', () => {
      expect(
        registerOemSchema.safeParse({
          ...validRegistration,
          password: 'Abcde@1x',
          confirmPassword: 'Abcde@1x',
        }).success,
      ).toBe(true);
    });

    it('should reject password without uppercase letter', () => {
      expect(
        registerOemSchema.safeParse({
          ...validRegistration,
          password: 'weakpass@1',
          confirmPassword: 'weakpass@1',
        }).success,
      ).toBe(false);
    });

    it('should reject password without lowercase letter', () => {
      expect(
        registerOemSchema.safeParse({
          ...validRegistration,
          password: 'WEAKPASS@1',
          confirmPassword: 'WEAKPASS@1',
        }).success,
      ).toBe(false);
    });

    it('should reject password without number', () => {
      expect(
        registerOemSchema.safeParse({
          ...validRegistration,
          password: 'WeakPass@abc',
          confirmPassword: 'WeakPass@abc',
        }).success,
      ).toBe(false);
    });

    it('should reject password without special character (!@#$%^&*)', () => {
      expect(
        registerOemSchema.safeParse({
          ...validRegistration,
          password: 'WeakPass1abc',
          confirmPassword: 'WeakPass1abc',
        }).success,
      ).toBe(false);
    });

    it('should reject empty password', () => {
      expect(
        registerOemSchema.safeParse({
          ...validRegistration,
          password: '',
          confirmPassword: '',
        }).success,
      ).toBe(false);
    });

    it.each(['!', '@', '#', '$', '%', '^', '&', '*'])(
      'should accept special character %s in password',
      (char) => {
        const pw = `Abcde1${char}x`;
        expect(
          registerOemSchema.safeParse({
            ...validRegistration,
            password: pw,
            confirmPassword: pw,
          }).success,
        ).toBe(true);
      },
    );

    it('should reject special character that is not in the allowed set', () => {
      // The regex is /[!@#$%^&*]/ -- a period is not in that set
      expect(
        registerOemSchema.safeParse({
          ...validRegistration,
          password: 'Abcde1.x',
          confirmPassword: 'Abcde1.x',
        }).success,
      ).toBe(false);
    });
  });

  // -- confirmPassword (refine: must match password) ------------------------

  describe('confirmPassword', () => {
    it('should reject mismatched passwords', () => {
      const result = registerOemSchema.safeParse({
        ...validRegistration,
        password: 'StrongP@ss1',
        confirmPassword: 'DifferentP@ss2',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('confirmPassword'));
        expect(issue?.message).toBe('Passwords do not match');
      }
    });

    it('should reject empty confirmPassword when password is set', () => {
      const result = registerOemSchema.safeParse({
        ...validRegistration,
        confirmPassword: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject confirmPassword differing only in case', () => {
      const result = registerOemSchema.safeParse({
        ...validRegistration,
        password: 'StrongP@ss1',
        confirmPassword: 'strongp@ss1',
      });
      expect(result.success).toBe(false);
    });
  });

  // -- firstName (min 2) ---------------------------------------------------

  describe('firstName', () => {
    it('should reject missing firstName', () => {
      const { firstName, ...rest } = validRegistration;
      expect(registerOemSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject single character (min 2)', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, firstName: 'A' }).success).toBe(false);
    });

    it('should accept exactly 2 characters', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, firstName: 'AB' }).success).toBe(true);
    });

    it('should reject empty string', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, firstName: '' }).success).toBe(false);
    });
  });

  // -- lastName (min 2) ----------------------------------------------------

  describe('lastName', () => {
    it('should reject missing lastName', () => {
      const { lastName, ...rest } = validRegistration;
      expect(registerOemSchema.safeParse(rest).success).toBe(false);
    });

    it('should reject single character (min 2)', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, lastName: 'K' }).success).toBe(false);
    });

    it('should accept exactly 2 characters', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, lastName: 'KR' }).success).toBe(true);
    });

    it('should reject empty string', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, lastName: '' }).success).toBe(false);
    });
  });

  // -- phone (optional, min 10, max 15) ------------------------------------

  describe('phone', () => {
    it('should accept valid 10-digit phone', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, phone: '9876543210' }).success).toBe(true);
    });

    it('should accept valid 13-char phone with country code', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, phone: '+919876543210' }).success).toBe(true);
    });

    it('should accept exactly 15 chars (max)', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, phone: '123456789012345' }).success).toBe(true);
    });

    it('should reject phone shorter than 10 chars', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, phone: '12345' }).success).toBe(false);
    });

    it('should reject phone longer than 15 chars', () => {
      expect(registerOemSchema.safeParse({ ...validRegistration, phone: '1234567890123456' }).success).toBe(false);
    });

    it('should accept when phone is omitted (optional)', () => {
      const { phone, ...withoutPhone } = { ...validRegistration, phone: undefined };
      expect(registerOemSchema.safeParse(withoutPhone).success).toBe(true);
    });
  });

  // -- empty object ---------------------------------------------------------

  it('should reject empty object', () => {
    expect(registerOemSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------

describe('loginSchema', () => {
  const validLogin = {
    email: 'user@example.com',
    password: 'anyPassword',
  };

  it('should accept valid login credentials', () => {
    expect(loginSchema.safeParse(validLogin).success).toBe(true);
  });

  it('should accept any non-empty password (no strength requirement for login)', () => {
    expect(loginSchema.safeParse({ ...validLogin, password: 'a' }).success).toBe(true);
  });

  // -- email ----------------------------------------------------------------

  describe('email', () => {
    it('should reject invalid email', () => {
      expect(loginSchema.safeParse({ ...validLogin, email: 'invalid' }).success).toBe(false);
    });

    it('should reject empty email', () => {
      expect(loginSchema.safeParse({ ...validLogin, email: '' }).success).toBe(false);
    });

    it('should reject missing email', () => {
      expect(loginSchema.safeParse({ password: 'password' }).success).toBe(false);
    });

    it('should reject whitespace-only email', () => {
      expect(loginSchema.safeParse({ ...validLogin, email: '   ' }).success).toBe(false);
    });
  });

  // -- password (min 1 for login) -------------------------------------------

  describe('password', () => {
    it('should reject empty password', () => {
      expect(loginSchema.safeParse({ ...validLogin, password: '' }).success).toBe(false);
    });

    it('should reject missing password', () => {
      expect(loginSchema.safeParse({ email: 'user@example.com' }).success).toBe(false);
    });

    it('should accept 1-character password', () => {
      expect(loginSchema.safeParse({ ...validLogin, password: 'x' }).success).toBe(true);
    });
  });

  it('should reject empty object', () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
  });
});
