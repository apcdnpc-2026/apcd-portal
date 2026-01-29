import {
  PrismaClient,
  ApplicationStatus,
  PaymentType,
  PaymentMethod,
  PaymentStatus,
  CertificateType,
  CertificateStatus,
  DocumentType,
  Role,
  EvaluationCriterion,
  EvaluationRecommendation,
  QueryStatus,
  NotificationType,
  FirmType,
  APCDInstallationCategory,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Helper: date N days ago
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Helper: date N days from now
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

export async function seedDummyData() {
  console.log('\n========================================');
  console.log('Seeding comprehensive dummy data...');
  console.log('========================================\n');

  // ========================================
  // Fetch existing users & APCD types
  // ========================================
  const officer = await prisma.user.findUnique({ where: { email: 'officer@npcindia.gov.in' } });
  const committee = await prisma.user.findUnique({ where: { email: 'committee@npcindia.gov.in' } });
  const fieldVerifier = await prisma.user.findUnique({
    where: { email: 'fieldverifier@npcindia.gov.in' },
  });
  const admin = await prisma.user.findUnique({ where: { email: 'head@npcindia.gov.in' } });
  const superAdmin = await prisma.user.findUnique({ where: { email: 'admin@npcindia.gov.in' } });

  if (!officer || !committee || !fieldVerifier || !admin || !superAdmin) {
    throw new Error('Required users not found. Run base seed first.');
  }

  const apcdTypes = await prisma.aPCDType.findMany({ orderBy: { sortOrder: 'asc' } });

  // ========================================
  // Create 5 additional OEM users with profiles
  // ========================================
  const oemCompanies = [
    {
      email: 'rajesh@greenairsystems.com',
      firstName: 'Rajesh',
      lastName: 'Sharma',
      company: 'Green Air Systems Pvt Ltd',
      state: 'Maharashtra',
      address: '45, MIDC Industrial Area, Pune, Maharashtra - 411026',
      pinCode: '411026',
      gst: '27AABCG5678H1ZQ',
      pan: 'AABCG5678H',
      firmType: FirmType.PRIVATE_LIMITED,
    },
    {
      email: 'suresh@envirotech.com',
      firstName: 'Suresh',
      lastName: 'Patel',
      company: 'EnviroTech Solutions Ltd',
      state: 'Gujarat',
      address: '78, GIDC Estate, Ahmedabad, Gujarat - 380015',
      pinCode: '380015',
      gst: '24AABCE9012K1ZR',
      pan: 'AABCE9012K',
      firmType: FirmType.LIMITED_COMPANY,
    },
    {
      email: 'anil@clearskyfiltration.com',
      firstName: 'Anil',
      lastName: 'Kumar',
      company: 'Clear Sky Filtration Systems',
      state: 'Tamil Nadu',
      address: '12, SIDCO Industrial Estate, Chennai, Tamil Nadu - 600032',
      pinCode: '600032',
      gst: '33AABCC3456M1ZS',
      pan: 'AABCC3456M',
      firmType: FirmType.PROPRIETARY,
    },
    {
      email: 'priya@pollucontrols.com',
      firstName: 'Priya',
      lastName: 'Singh',
      company: 'Pollu Controls India Pvt Ltd',
      state: 'Karnataka',
      address: '56, Peenya Industrial Area, Bangalore, Karnataka - 560058',
      pinCode: '560058',
      gst: '29AABCP7890N1ZT',
      pan: 'AABCP7890N',
      firmType: FirmType.PRIVATE_LIMITED,
    },
    {
      email: 'vikram@dustfreeindia.com',
      firstName: 'Vikram',
      lastName: 'Mehta',
      company: 'DustFree India Engineering',
      state: 'Rajasthan',
      address: '89, RIICO Industrial Area, Jaipur, Rajasthan - 302022',
      pinCode: '302022',
      gst: '08AABCD1234P1ZU',
      pan: 'AABCD1234P',
      firmType: FirmType.PRIVATE_LIMITED,
    },
  ];

  const oemUsers: any[] = [];
  const oemProfiles: any[] = [];
  const pwHash = await bcrypt.hash('Oem@APCD2025!', 12);

  for (const oem of oemCompanies) {
    const user = await prisma.user.upsert({
      where: { email: oem.email },
      update: {},
      create: {
        email: oem.email,
        passwordHash: pwHash,
        role: Role.OEM,
        firstName: oem.firstName,
        lastName: oem.lastName,
        isActive: true,
        isVerified: true,
      },
    });
    oemUsers.push(user);

    const profile = await prisma.oemProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        companyName: oem.company,
        fullAddress: oem.address,
        state: oem.state,
        pinCode: oem.pinCode,
        contactNo: '98' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        gstRegistrationNo: oem.gst,
        panNo: oem.pan,
        firmType: oem.firmType,
        firmAreaSqm: 500 + Math.floor(Math.random() * 2000),
        employeeCount: 20 + Math.floor(Math.random() * 200),
        gpsLatitude: 20 + Math.random() * 10,
        gpsLongitude: 73 + Math.random() * 10,
      },
    });
    oemProfiles.push(profile);
  }

  // Also get existing test OEM
  const existingOem = await prisma.user.findUnique({ where: { email: 'oem@testcompany.com' } });
  if (existingOem) {
    oemUsers.unshift(existingOem);
    const existingProfile = await prisma.oemProfile.findUnique({
      where: { userId: existingOem.id },
    });
    if (existingProfile) oemProfiles.unshift(existingProfile);
  }

  console.log(`Created/found ${oemUsers.length} OEM users with profiles`);

  // ========================================
  // Create applications in various statuses
  // ========================================
  const applicationConfigs = [
    { oemIdx: 0, status: ApplicationStatus.SUBMITTED, number: 'APCD-2025-0001', daysOld: 30 },
    { oemIdx: 1, status: ApplicationStatus.UNDER_REVIEW, number: 'APCD-2025-0002', daysOld: 25 },
    { oemIdx: 2, status: ApplicationStatus.QUERIED, number: 'APCD-2025-0003', daysOld: 20 },
    {
      oemIdx: 3,
      status: ApplicationStatus.COMMITTEE_REVIEW,
      number: 'APCD-2025-0004',
      daysOld: 15,
    },
    {
      oemIdx: 4,
      status: ApplicationStatus.FIELD_VERIFICATION,
      number: 'APCD-2025-0005',
      daysOld: 12,
    },
    { oemIdx: 5, status: ApplicationStatus.LAB_TESTING, number: 'APCD-2025-0006', daysOld: 10 },
    { oemIdx: 0, status: ApplicationStatus.APPROVED, number: 'APCD-2025-0007', daysOld: 60 },
    { oemIdx: 1, status: ApplicationStatus.DRAFT, number: 'APCD-2025-0008', daysOld: 5 },
    { oemIdx: 2, status: ApplicationStatus.FINAL_REVIEW, number: 'APCD-2025-0009', daysOld: 8 },
    { oemIdx: 3, status: ApplicationStatus.REJECTED, number: 'APCD-2025-0010', daysOld: 45 },
    { oemIdx: 4, status: ApplicationStatus.RESUBMITTED, number: 'APCD-2025-0011', daysOld: 18 },
    {
      oemIdx: 5,
      status: ApplicationStatus.PROVISIONALLY_APPROVED,
      number: 'APCD-2025-0012',
      daysOld: 50,
    },
  ];

  const applications: any[] = [];

  for (const cfg of applicationConfigs) {
    const oemUser = oemUsers[cfg.oemIdx];
    const oemProfile = oemProfiles[cfg.oemIdx];
    if (!oemUser || !oemProfile) continue;

    const isSubmitted = cfg.status !== ApplicationStatus.DRAFT;
    const needsOfficer = [
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.QUERIED,
      ApplicationStatus.COMMITTEE_REVIEW,
      ApplicationStatus.FIELD_VERIFICATION,
      ApplicationStatus.LAB_TESTING,
      ApplicationStatus.FINAL_REVIEW,
      ApplicationStatus.APPROVED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.RESUBMITTED,
      ApplicationStatus.PROVISIONALLY_APPROVED,
    ].includes(cfg.status);

    const app = await prisma.application.upsert({
      where: { applicationNumber: cfg.number },
      update: {},
      create: {
        applicationNumber: cfg.number,
        oemProfileId: oemProfile.id,
        applicantId: oemUser.id,
        assignedOfficerId: needsOfficer ? officer.id : null,
        status: cfg.status,
        currentStep: isSubmitted ? 9 : 3,
        turnoverYear1: 5000000 + Math.floor(Math.random() * 10000000),
        turnoverYear2: 6000000 + Math.floor(Math.random() * 12000000),
        turnoverYear3: 7000000 + Math.floor(Math.random() * 15000000),
        hasISO9001: Math.random() > 0.3,
        hasISO14001: Math.random() > 0.5,
        hasISO45001: Math.random() > 0.7,
        isBlacklisted: false,
        hasGrievanceSystem: true,
        declarationAccepted: isSubmitted,
        declarationDate: isSubmitted ? daysAgo(cfg.daysOld) : null,
        declarationSignatory: isSubmitted ? `${oemUser.firstName} ${oemUser.lastName}` : null,
        submittedAt: isSubmitted ? daysAgo(cfg.daysOld) : null,
        approvedAt: cfg.status === ApplicationStatus.APPROVED ? daysAgo(cfg.daysOld - 5) : null,
        rejectedAt: cfg.status === ApplicationStatus.REJECTED ? daysAgo(cfg.daysOld - 3) : null,
        rejectionReason:
          cfg.status === ApplicationStatus.REJECTED
            ? 'Insufficient documentation and test reports not from NABL accredited lab'
            : null,
        lastQueriedAt: cfg.status === ApplicationStatus.QUERIED ? daysAgo(cfg.daysOld - 2) : null,
        createdAt: daysAgo(cfg.daysOld + 2),
      },
    });
    applications.push(app);
  }
  console.log(`Created ${applications.length} applications`);

  // ========================================
  // Link APCDs to applications
  // ========================================
  for (let i = 0; i < applications.length; i++) {
    const app = applications[i];
    const numApcds = 1 + Math.floor(Math.random() * 3); // 1-3 APCDs per application
    for (let j = 0; j < numApcds && j < apcdTypes.length; j++) {
      const typeIdx = (i * 3 + j) % apcdTypes.length;
      await prisma.applicationApcd.upsert({
        where: {
          applicationId_apcdTypeId: { applicationId: app.id, apcdTypeId: apcdTypes[typeIdx].id },
        },
        update: {},
        create: {
          applicationId: app.id,
          apcdTypeId: apcdTypes[typeIdx].id,
          isManufactured: true,
          seekingEmpanelment: true,
          installationCategory: APCDInstallationCategory.BOILER_FURNACE_TFH,
          designCapacityRange: '10,000 - 50,000 Nm3/hr',
        },
      });
    }
  }
  console.log('Linked APCDs to applications');

  // ========================================
  // Contact persons
  // ========================================
  for (const app of applications) {
    const existing = await prisma.contactPerson.findFirst({ where: { applicationId: app.id } });
    if (!existing) {
      await prisma.contactPerson.createMany({
        data: [
          {
            applicationId: app.id,
            type: 'COMMERCIAL',
            name: 'Mr. Commercial Contact',
            designation: 'Sales Manager',
            mobileNo: '9876500001',
            email: 'commercial@example.com',
          },
          {
            applicationId: app.id,
            type: 'TECHNICAL',
            name: 'Mr. Technical Contact',
            designation: 'Chief Engineer',
            mobileNo: '9876500002',
            email: 'technical@example.com',
          },
        ],
      });
    }
  }
  console.log('Created contact persons');

  // ========================================
  // Installation experiences
  // ========================================
  for (const app of applications) {
    const existing = await prisma.installationExperience.findFirst({
      where: { applicationId: app.id },
    });
    if (!existing) {
      await prisma.installationExperience.createMany({
        data: [
          {
            applicationId: app.id,
            industryName: 'Tata Steel Ltd',
            location: 'Jamshedpur, Jharkhand',
            installationDate: 'March 2023',
            emissionSource: 'Blast Furnace',
            apcdType: 'ESP',
            apcdCapacity: '25,000 Nm3/hr',
            performanceResult: 'PM: 30 mg/Nm3 (within CPCB norms)',
            sortOrder: 1,
          },
          {
            applicationId: app.id,
            industryName: 'ACC Cement Ltd',
            location: 'Wadi, Karnataka',
            installationDate: 'July 2023',
            emissionSource: 'Kiln',
            apcdType: 'Bag Filter',
            apcdCapacity: '40,000 Nm3/hr',
            performanceResult: 'PM: 25 mg/Nm3 (within CPCB norms)',
            sortOrder: 2,
          },
          {
            applicationId: app.id,
            industryName: 'JSW Steel Ltd',
            location: 'Bellary, Karnataka',
            installationDate: 'November 2023',
            emissionSource: 'Sinter Plant',
            apcdType: 'Wet Scrubber',
            apcdCapacity: '30,000 Nm3/hr',
            performanceResult: 'SOx: 200 mg/Nm3, PM: 40 mg/Nm3',
            sortOrder: 3,
          },
        ],
      });
    }
  }
  console.log('Created installation experiences');

  // ========================================
  // Staff details
  // ========================================
  for (const app of applications) {
    const existing = await prisma.staffDetail.findFirst({ where: { applicationId: app.id } });
    if (!existing) {
      await prisma.staffDetail.createMany({
        data: [
          {
            applicationId: app.id,
            name: 'Dr. Ramesh Kumar',
            designation: 'Technical Director',
            qualification: 'Ph.D. Chemical Engineering, IIT Delhi',
            experienceYears: 18,
            sortOrder: 1,
          },
          {
            applicationId: app.id,
            name: 'Mr. Sunil Verma',
            designation: 'Production Manager',
            qualification: 'B.Tech Mechanical Engineering',
            experienceYears: 12,
            sortOrder: 2,
          },
          {
            applicationId: app.id,
            name: 'Mr. Amit Joshi',
            designation: 'Quality Control Head',
            qualification: 'M.Tech Environmental Engineering',
            experienceYears: 8,
            isFieldVisitCoordinator: true,
            mobileNo: '9876500010',
            sortOrder: 3,
          },
        ],
      });
    }
  }
  console.log('Created staff details');

  // ========================================
  // Attachments (dummy file references)
  // ========================================
  const docTypes: DocumentType[] = [
    DocumentType.COMPANY_REGISTRATION,
    DocumentType.GST_CERTIFICATE,
    DocumentType.PAN_CARD,
    DocumentType.PAYMENT_PROOF,
    DocumentType.ISO_CERTIFICATION,
    DocumentType.PRODUCT_DATASHEET,
    DocumentType.TEST_CERTIFICATE,
    DocumentType.TURNOVER_CERTIFICATE,
  ];

  for (const app of applications) {
    if (app.status === ApplicationStatus.DRAFT) continue;
    const existing = await prisma.attachment.findFirst({ where: { applicationId: app.id } });
    if (!existing) {
      for (const docType of docTypes) {
        await prisma.attachment.create({
          data: {
            applicationId: app.id,
            documentType: docType,
            fileName: `${docType.toLowerCase()}_${app.applicationNumber}.pdf`,
            originalName: `${docType.replace(/_/g, ' ')}.pdf`,
            mimeType: 'application/pdf',
            fileSizeBytes: BigInt(100000 + Math.floor(Math.random() * 500000)),
            storagePath: `uploads/${app.applicationNumber}/${docType.toLowerCase()}.pdf`,
            storageBucket: 'apcd-documents',
            uploadedBy: app.applicantId,
            virusScanStatus: 'CLEAN',
          },
        });
      }
      // Add geo-tagged photos
      const photoSlots = ['FRONT_VIEW', 'MANUFACTURING_AREA', 'TESTING_LAB'];
      for (const slot of photoSlots) {
        await prisma.attachment.create({
          data: {
            applicationId: app.id,
            documentType: DocumentType.GEO_TAGGED_PHOTOS,
            fileName: `factory_${slot.toLowerCase()}_${app.applicationNumber}.jpg`,
            originalName: `Factory ${slot.replace(/_/g, ' ')}.jpg`,
            mimeType: 'image/jpeg',
            fileSizeBytes: BigInt(500000 + Math.floor(Math.random() * 2000000)),
            storagePath: `uploads/${app.applicationNumber}/photos/${slot.toLowerCase()}.jpg`,
            storageBucket: 'apcd-documents',
            uploadedBy: app.applicantId,
            photoSlot: slot,
            geoLatitude: 28.6 + Math.random() * 0.1,
            geoLongitude: 77.2 + Math.random() * 0.1,
            geoTimestamp: daysAgo(35),
            hasValidGeoTag: true,
            isWithinIndia: true,
            virusScanStatus: 'CLEAN',
          },
        });
      }
    }
  }
  console.log('Created attachments');

  // ========================================
  // Payments
  // ========================================
  const paymentStatuses: {
    appIdx: number;
    type: PaymentType;
    status: PaymentStatus;
    method: PaymentMethod;
  }[] = [
    {
      appIdx: 0,
      type: PaymentType.APPLICATION_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.NEFT,
    },
    {
      appIdx: 1,
      type: PaymentType.APPLICATION_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.RAZORPAY,
    },
    {
      appIdx: 2,
      type: PaymentType.APPLICATION_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.NEFT,
    },
    {
      appIdx: 3,
      type: PaymentType.APPLICATION_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.RAZORPAY,
    },
    {
      appIdx: 3,
      type: PaymentType.EMPANELMENT_FEE,
      status: PaymentStatus.VERIFICATION_PENDING,
      method: PaymentMethod.NEFT,
    },
    {
      appIdx: 4,
      type: PaymentType.APPLICATION_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.NEFT,
    },
    {
      appIdx: 4,
      type: PaymentType.FIELD_VERIFICATION,
      status: PaymentStatus.VERIFICATION_PENDING,
      method: PaymentMethod.NEFT,
    },
    {
      appIdx: 5,
      type: PaymentType.APPLICATION_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.RAZORPAY,
    },
    {
      appIdx: 5,
      type: PaymentType.FIELD_VERIFICATION,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.NEFT,
    },
    {
      appIdx: 6,
      type: PaymentType.APPLICATION_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.RAZORPAY,
    },
    {
      appIdx: 6,
      type: PaymentType.EMPANELMENT_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.NEFT,
    },
    {
      appIdx: 6,
      type: PaymentType.FIELD_VERIFICATION,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.NEFT,
    },
    {
      appIdx: 8,
      type: PaymentType.APPLICATION_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.RAZORPAY,
    },
    {
      appIdx: 9,
      type: PaymentType.APPLICATION_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.NEFT,
    },
    {
      appIdx: 10,
      type: PaymentType.APPLICATION_FEE,
      status: PaymentStatus.COMPLETED,
      method: PaymentMethod.RAZORPAY,
    },
    {
      appIdx: 11,
      type: PaymentType.APPLICATION_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.NEFT,
    },
    {
      appIdx: 11,
      type: PaymentType.EMPANELMENT_FEE,
      status: PaymentStatus.VERIFIED,
      method: PaymentMethod.RAZORPAY,
    },
  ];

  for (const pcfg of paymentStatuses) {
    const app = applications[pcfg.appIdx];
    if (!app) continue;

    const baseAmount =
      pcfg.type === PaymentType.APPLICATION_FEE
        ? 25000
        : pcfg.type === PaymentType.EMPANELMENT_FEE
          ? 65000
          : pcfg.type === PaymentType.FIELD_VERIFICATION
            ? 57000
            : 35000;

    const gstAmount = baseAmount * 0.18;
    const totalAmount = baseAmount + gstAmount;

    const existingPayment = await prisma.payment.findFirst({
      where: { applicationId: app.id, paymentType: pcfg.type },
    });
    if (existingPayment) continue;

    await prisma.payment.create({
      data: {
        applicationId: app.id,
        paymentType: pcfg.type,
        paymentMethod: pcfg.method,
        status: pcfg.status,
        baseAmount,
        gstRate: 18,
        gstAmount,
        discountPercent: 0,
        discountAmount: 0,
        totalAmount,
        utrNumber:
          pcfg.method === PaymentMethod.NEFT
            ? `UTR${Date.now()}${Math.floor(Math.random() * 1000)}`
            : null,
        remitterBankName: pcfg.method === PaymentMethod.NEFT ? 'State Bank of India' : null,
        neftAmount: pcfg.method === PaymentMethod.NEFT ? totalAmount : null,
        neftDate: pcfg.method === PaymentMethod.NEFT ? daysAgo(20) : null,
        razorpayOrderId:
          pcfg.method === PaymentMethod.RAZORPAY
            ? `order_${Math.random().toString(36).substring(7)}`
            : null,
        razorpayPaymentId:
          pcfg.method === PaymentMethod.RAZORPAY && pcfg.status !== PaymentStatus.PENDING
            ? `pay_${Math.random().toString(36).substring(7)}`
            : null,
        verifiedById: pcfg.status === PaymentStatus.VERIFIED ? officer.id : null,
        verifiedAt: pcfg.status === PaymentStatus.VERIFIED ? daysAgo(15) : null,
        verificationNote:
          pcfg.status === PaymentStatus.VERIFIED ? 'Payment verified against bank statement' : null,
        createdAt: daysAgo(25),
      },
    });
  }
  console.log('Created payments');

  // ========================================
  // Queries (Officer queries on applications)
  // ========================================
  const queriedApp = applications[2]; // QUERIED status
  if (queriedApp) {
    const existingQuery = await prisma.query.findFirst({ where: { applicationId: queriedApp.id } });
    if (!existingQuery) {
      const query1 = await prisma.query.create({
        data: {
          applicationId: queriedApp.id,
          raisedById: officer.id,
          subject: 'Incomplete GST Certificate',
          description:
            'The uploaded GST certificate appears to be expired. Please upload the current valid GST certificate with all pages clearly visible.',
          documentType: DocumentType.GST_CERTIFICATE,
          status: QueryStatus.OPEN,
          deadline: daysFromNow(7),
        },
      });
      await prisma.queryResponse.create({
        data: {
          queryId: query1.id,
          responderId: queriedApp.applicantId,
          message:
            'We have applied for GST renewal. The updated certificate will be uploaded within 3 days.',
        },
      });

      await prisma.query.create({
        data: {
          applicationId: queriedApp.id,
          raisedById: officer.id,
          subject: 'Missing Test Reports',
          description:
            'Test reports from NABL accredited laboratory are required for ESP models. The uploaded reports are from a non-accredited lab.',
          documentType: DocumentType.TEST_CERTIFICATE,
          status: QueryStatus.OPEN,
          deadline: daysFromNow(10),
        },
      });
    }
  }

  // Also add a resolved query on another app
  const reviewApp = applications[1]; // UNDER_REVIEW
  if (reviewApp) {
    const existingQuery = await prisma.query.findFirst({ where: { applicationId: reviewApp.id } });
    if (!existingQuery) {
      const q = await prisma.query.create({
        data: {
          applicationId: reviewApp.id,
          raisedById: officer.id,
          subject: 'Clarification on turnover figures',
          description:
            'The turnover figures for FY 2023-24 do not match the audited balance sheet. Please clarify.',
          documentType: DocumentType.TURNOVER_CERTIFICATE,
          status: QueryStatus.RESOLVED,
          createdAt: daysAgo(22),
        },
      });
      await prisma.queryResponse.create({
        data: {
          queryId: q.id,
          responderId: reviewApp.applicantId,
          message:
            'The discrepancy was due to an export order booked in March. Revised CA certificate attached.',
          createdAt: daysAgo(20),
        },
      });
    }
  }
  console.log('Created queries and responses');

  // ========================================
  // Committee Evaluations
  // ========================================
  const committeeApp = applications[3]; // COMMITTEE_REVIEW
  if (committeeApp) {
    const existing = await prisma.committeeEvaluation.findFirst({
      where: { applicationId: committeeApp.id },
    });
    if (!existing) {
      const evaluation = await prisma.committeeEvaluation.create({
        data: {
          applicationId: committeeApp.id,
          evaluatorId: committee.id,
          recommendation: EvaluationRecommendation.FIELD_VERIFICATION_REQUIRED,
          overallRemarks:
            'Good application overall. Technical specifications are sound. Recommend field verification for the ESP installation at Tata Steel.',
          completedAt: daysAgo(10),
        },
      });

      const criteria = [
        { criterion: EvaluationCriterion.EXPERIENCE_SCOPE, score: 8 },
        { criterion: EvaluationCriterion.TECHNICAL_SPECIFICATION, score: 7 },
        { criterion: EvaluationCriterion.TECHNICAL_TEAM, score: 8 },
        { criterion: EvaluationCriterion.FINANCIAL_STANDING, score: 6 },
        { criterion: EvaluationCriterion.LEGAL_QUALITY_COMPLIANCE, score: 9 },
        { criterion: EvaluationCriterion.COMPLAINT_HANDLING, score: 7 },
        { criterion: EvaluationCriterion.CLIENT_FEEDBACK, score: 8 },
        { criterion: EvaluationCriterion.GLOBAL_SUPPLY, score: 5 },
      ];

      for (const c of criteria) {
        await prisma.evaluationScore.create({
          data: {
            evaluationId: evaluation.id,
            criterion: c.criterion,
            score: c.score,
            maxScore: 10,
            remarks: `Score ${c.score}/10 - ${c.score >= 7 ? 'Satisfactory' : 'Needs improvement'}`,
          },
        });
      }
    }
  }

  // Also add evaluation for final review app
  const finalApp = applications[8]; // FINAL_REVIEW
  if (finalApp) {
    const existing = await prisma.committeeEvaluation.findFirst({
      where: { applicationId: finalApp.id },
    });
    if (!existing) {
      const evaluation = await prisma.committeeEvaluation.create({
        data: {
          applicationId: finalApp.id,
          evaluatorId: committee.id,
          recommendation: EvaluationRecommendation.APPROVE,
          overallRemarks:
            'Excellent application. All criteria met. Field verification passed. Recommend approval for empanelment.',
          completedAt: daysAgo(5),
        },
      });
      const scores = [9, 8, 9, 7, 9, 8, 9, 6];
      const criteriaList = Object.values(EvaluationCriterion);
      for (let i = 0; i < criteriaList.length; i++) {
        await prisma.evaluationScore.create({
          data: {
            evaluationId: evaluation.id,
            criterion: criteriaList[i],
            score: scores[i],
            maxScore: 10,
          },
        });
      }
    }
  }
  console.log('Created committee evaluations');

  // ========================================
  // Field Reports
  // ========================================
  const fieldApp = applications[4]; // FIELD_VERIFICATION
  if (fieldApp) {
    const existing = await prisma.fieldReport.findFirst({ where: { applicationId: fieldApp.id } });
    if (!existing) {
      await prisma.fieldReport.create({
        data: {
          applicationId: fieldApp.id,
          verifierId: fieldVerifier.id,
          siteIndex: 1,
          visitDate: daysAgo(5),
          industryName: 'Tata Steel Ltd',
          location: 'Jamshedpur, Jharkhand',
          apcdCondition: 'ESP in good working condition. Regular maintenance observed.',
          apcdOperational: true,
          emissionCompliant: true,
          inletReading: '450 mg/Nm3',
          outletReading: '28 mg/Nm3',
          pressureDrop: '120 mm WC',
          observations:
            'Factory is well-maintained. ESP plates were recently cleaned. Proper DAS system installed.',
          recommendation: 'PASS - Installation meets CPCB emission norms',
          overallResult: 'PASS',
        },
      });
      await prisma.fieldReport.create({
        data: {
          applicationId: fieldApp.id,
          verifierId: fieldVerifier.id,
          siteIndex: 2,
          visitDate: daysAgo(3),
          industryName: 'ACC Cement Ltd',
          location: 'Wadi, Karnataka',
          apcdCondition: 'Bag filter system operational. Minor wear on some bags.',
          apcdOperational: true,
          emissionCompliant: true,
          inletReading: '600 mg/Nm3',
          outletReading: '22 mg/Nm3',
          pressureDrop: '150 mm WC',
          observations:
            'Bag house performing well. Recommended replacement of worn bags within 3 months.',
          recommendation: 'PASS with observation - Replace worn filter bags',
          overallResult: 'CONDITIONAL',
        },
      });
    }
  }

  // Field verification sites
  for (const app of applications) {
    if (
      [
        ApplicationStatus.FIELD_VERIFICATION,
        ApplicationStatus.LAB_TESTING,
        ApplicationStatus.FINAL_REVIEW,
        ApplicationStatus.APPROVED,
      ].includes(app.status)
    ) {
      const existing = await prisma.fieldVerificationSite.findFirst({
        where: { applicationId: app.id },
      });
      if (!existing) {
        await prisma.fieldVerificationSite.createMany({
          data: [
            {
              applicationId: app.id,
              slNo: 1,
              industryName: 'Tata Steel Ltd',
              location: 'Jamshedpur, Jharkhand',
              apcdType: 'ESP',
              industryRepName: 'Mr. R.K. Singh',
              industryRepDesignation: 'Plant Manager',
              industryRepMobile: '9876512345',
              installationDate: 'March 2023',
            },
            {
              applicationId: app.id,
              slNo: 2,
              industryName: 'ACC Cement Ltd',
              location: 'Wadi, Karnataka',
              apcdType: 'Bag Filter',
              industryRepName: 'Mr. S. Patil',
              industryRepDesignation: 'Works Manager',
              industryRepMobile: '9876567890',
              installationDate: 'July 2023',
            },
          ],
        });
      }
    }
  }
  console.log('Created field reports and verification sites');

  // ========================================
  // Certificates
  // ========================================
  const approvedApp = applications[6]; // APPROVED
  if (approvedApp) {
    const existing = await prisma.certificate.findFirst({
      where: { applicationId: approvedApp.id },
    });
    if (!existing) {
      await prisma.certificate.create({
        data: {
          applicationId: approvedApp.id,
          certificateNumber: 'APCD-CERT-2025-0001',
          type: CertificateType.FINAL,
          status: CertificateStatus.ACTIVE,
          issuedDate: daysAgo(55),
          validFrom: daysAgo(55),
          validUntil: daysFromNow(675), // ~2 years
          qrCodeData: `https://apcd.npcindia.gov.in/verify/APCD-CERT-2025-0001`,
        },
      });
    }
  }

  const provApp = applications[11]; // PROVISIONALLY_APPROVED
  if (provApp) {
    const existing = await prisma.certificate.findFirst({ where: { applicationId: provApp.id } });
    if (!existing) {
      await prisma.certificate.create({
        data: {
          applicationId: provApp.id,
          certificateNumber: 'APCD-CERT-2025-0002',
          type: CertificateType.PROVISIONAL,
          status: CertificateStatus.ACTIVE,
          issuedDate: daysAgo(45),
          validFrom: daysAgo(45),
          validUntil: daysFromNow(320),
          qrCodeData: `https://apcd.npcindia.gov.in/verify/APCD-CERT-2025-0002`,
        },
      });
    }
  }

  // An expired certificate
  await prisma.certificate.upsert({
    where: { certificateNumber: 'APCD-CERT-2024-0099' },
    update: {},
    create: {
      applicationId: applications[0].id,
      certificateNumber: 'APCD-CERT-2024-0099',
      type: CertificateType.FINAL,
      status: CertificateStatus.EXPIRED,
      issuedDate: daysAgo(800),
      validFrom: daysAgo(800),
      validUntil: daysAgo(70),
      qrCodeData: `https://apcd.npcindia.gov.in/verify/APCD-CERT-2024-0099`,
    },
  });
  console.log('Created certificates');

  // ========================================
  // Status History
  // ========================================
  for (const app of applications) {
    const existing = await prisma.applicationStatusHistory.findFirst({
      where: { applicationId: app.id },
    });
    if (existing) continue;

    const history: { from: ApplicationStatus | null; to: ApplicationStatus; daysBack: number }[] = [
      { from: null, to: ApplicationStatus.DRAFT, daysBack: 35 },
    ];

    if (app.status !== ApplicationStatus.DRAFT) {
      history.push({
        from: ApplicationStatus.DRAFT,
        to: ApplicationStatus.SUBMITTED,
        daysBack: 30,
      });
    }
    if (
      [
        ApplicationStatus.UNDER_REVIEW,
        ApplicationStatus.QUERIED,
        ApplicationStatus.COMMITTEE_REVIEW,
        ApplicationStatus.FIELD_VERIFICATION,
        ApplicationStatus.LAB_TESTING,
        ApplicationStatus.FINAL_REVIEW,
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.RESUBMITTED,
        ApplicationStatus.PROVISIONALLY_APPROVED,
      ].includes(app.status)
    ) {
      history.push({
        from: ApplicationStatus.SUBMITTED,
        to: ApplicationStatus.UNDER_REVIEW,
        daysBack: 28,
      });
    }
    if (app.status === ApplicationStatus.QUERIED) {
      history.push({
        from: ApplicationStatus.UNDER_REVIEW,
        to: ApplicationStatus.QUERIED,
        daysBack: 20,
      });
    }
    if (app.status === ApplicationStatus.COMMITTEE_REVIEW) {
      history.push({
        from: ApplicationStatus.UNDER_REVIEW,
        to: ApplicationStatus.COMMITTEE_REVIEW,
        daysBack: 15,
      });
    }
    if (app.status === ApplicationStatus.APPROVED) {
      history.push(
        {
          from: ApplicationStatus.UNDER_REVIEW,
          to: ApplicationStatus.COMMITTEE_REVIEW,
          daysBack: 20,
        },
        { from: ApplicationStatus.COMMITTEE_REVIEW, to: ApplicationStatus.APPROVED, daysBack: 5 },
      );
    }

    for (const h of history) {
      await prisma.applicationStatusHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: h.from,
          toStatus: h.to,
          changedBy: h.from === null ? app.applicantId : officer.id,
          remarks: `Status changed to ${h.to}`,
          createdAt: daysAgo(h.daysBack),
        },
      });
    }
  }
  console.log('Created status history');

  // ========================================
  // Notifications
  // ========================================
  const notificationData: {
    userId: string;
    appId: string;
    type: NotificationType;
    title: string;
    message: string;
    read: boolean;
    daysBack: number;
  }[] = [];

  for (let i = 0; i < Math.min(6, applications.length); i++) {
    const app = applications[i];
    // Notification to OEM
    notificationData.push({
      userId: app.applicantId,
      appId: app.id,
      type: NotificationType.APPLICATION_SUBMITTED,
      title: 'Application Submitted',
      message: `Your application ${app.applicationNumber} has been submitted successfully and is under review.`,
      read: i < 3,
      daysBack: 25 - i,
    });
    // Notification to officer
    notificationData.push({
      userId: officer.id,
      appId: app.id,
      type: NotificationType.APPLICATION_SUBMITTED,
      title: 'New Application Received',
      message: `Application ${app.applicationNumber} has been submitted and assigned to you for review.`,
      read: i < 2,
      daysBack: 25 - i,
    });
  }

  // Query notifications
  if (queriedApp) {
    notificationData.push({
      userId: queriedApp.applicantId,
      appId: queriedApp.id,
      type: NotificationType.APPLICATION_QUERIED,
      title: 'Query Raised on Application',
      message: `A query has been raised on your application ${queriedApp.applicationNumber}. Please respond within 7 days.`,
      read: false,
      daysBack: 18,
    });
  }

  // Payment notifications
  notificationData.push({
    userId: officer.id,
    appId: applications[0].id,
    type: NotificationType.PAYMENT_RECEIVED,
    title: 'Payment Received',
    message: `Application fee payment received for ${applications[0].applicationNumber}. Please verify.`,
    read: true,
    daysBack: 22,
  });

  // Certificate notification
  if (approvedApp) {
    notificationData.push({
      userId: approvedApp.applicantId,
      appId: approvedApp.id,
      type: NotificationType.CERTIFICATE_ISSUED,
      title: 'Certificate Issued',
      message: `Empanelment certificate APCD-CERT-2025-0001 has been issued for your application.`,
      read: false,
      daysBack: 50,
    });
  }

  // Admin notification
  notificationData.push({
    userId: admin.id,
    appId: applications[0].id,
    type: NotificationType.GENERAL,
    title: 'Monthly Report Ready',
    message:
      'The MIS report for this month is ready. 12 applications processed, 2 certificates issued.',
    read: false,
    daysBack: 2,
  });

  for (const n of notificationData) {
    await prisma.notification.create({
      data: {
        userId: n.userId,
        applicationId: n.appId,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.read,
        createdAt: daysAgo(n.daysBack),
      },
    });
  }
  console.log(`Created ${notificationData.length} notifications`);

  // ========================================
  // Audit Logs
  // ========================================
  const auditActions = [
    { action: 'APPLICATION_SUBMITTED', entityType: 'Application', userId: oemUsers[0]?.id },
    { action: 'APPLICATION_REVIEWED', entityType: 'Application', userId: officer.id },
    { action: 'QUERY_RAISED', entityType: 'Query', userId: officer.id },
    { action: 'PAYMENT_VERIFIED', entityType: 'Payment', userId: officer.id },
    { action: 'EVALUATION_COMPLETED', entityType: 'CommitteeEvaluation', userId: committee.id },
    { action: 'FIELD_REPORT_SUBMITTED', entityType: 'FieldReport', userId: fieldVerifier.id },
    { action: 'APPLICATION_APPROVED', entityType: 'Application', userId: admin.id },
    { action: 'CERTIFICATE_GENERATED', entityType: 'Certificate', userId: admin.id },
    { action: 'USER_CREATED', entityType: 'User', userId: superAdmin.id },
    { action: 'FEE_UPDATED', entityType: 'FeeConfiguration', userId: superAdmin.id },
    { action: 'LOGIN', entityType: 'User', userId: officer.id },
    { action: 'LOGIN', entityType: 'User', userId: committee.id },
    { action: 'LOGIN', entityType: 'User', userId: admin.id },
    { action: 'APPLICATION_SUBMITTED', entityType: 'Application', userId: oemUsers[1]?.id },
    { action: 'APPLICATION_SUBMITTED', entityType: 'Application', userId: oemUsers[2]?.id },
  ];

  for (let i = 0; i < auditActions.length; i++) {
    const a = auditActions[i];
    const app = applications[i % applications.length];
    await prisma.auditLog.create({
      data: {
        userId: a.userId,
        action: a.action,
        entityType: a.entityType,
        entityId: app.id,
        ipAddress: '192.168.1.' + (10 + i),
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        createdAt: daysAgo(30 - i * 2),
      },
    });
  }
  console.log(`Created ${auditActions.length} audit logs`);

  // ========================================
  // Lab test report attachment for LAB_TESTING app
  // ========================================
  const labApp = applications[5]; // LAB_TESTING
  if (labApp) {
    const existing = await prisma.attachment.findFirst({
      where: { applicationId: labApp.id, documentType: DocumentType.LAB_TEST_REPORT },
    });
    if (!existing) {
      await prisma.attachment.create({
        data: {
          applicationId: labApp.id,
          documentType: DocumentType.LAB_TEST_REPORT,
          fileName: `lab_report_${labApp.applicationNumber}.pdf`,
          originalName: 'Lab Test Report - NABL.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: BigInt(850000),
          storagePath: `uploads/${labApp.applicationNumber}/lab_test_report.pdf`,
          storageBucket: 'apcd-documents',
          uploadedBy: labApp.applicantId,
          virusScanStatus: 'CLEAN',
        },
      });
    }
  }

  console.log('\n========================================');
  console.log('Dummy data seeding completed!');
  console.log('========================================');
  console.log('\nSummary:');
  console.log(`  - ${oemUsers.length} OEM users with profiles`);
  console.log(`  - ${applications.length} applications in various statuses`);
  console.log(`  - Multiple payments (verified, pending, completed)`);
  console.log(`  - Queries with responses`);
  console.log(`  - Committee evaluations with scores`);
  console.log(`  - Field verification reports`);
  console.log(`  - Certificates (active, provisional, expired)`);
  console.log(`  - Notifications for all roles`);
  console.log(`  - Audit logs`);
  console.log(`  - Attachments and documents`);
}
