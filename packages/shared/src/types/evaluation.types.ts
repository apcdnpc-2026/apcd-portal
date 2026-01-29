export enum EvaluationCriterion {
  EXPERIENCE_SCOPE = 'EXPERIENCE_SCOPE',
  TECHNICAL_SPECIFICATION = 'TECHNICAL_SPECIFICATION',
  TECHNICAL_TEAM = 'TECHNICAL_TEAM',
  FINANCIAL_STANDING = 'FINANCIAL_STANDING',
  LEGAL_QUALITY_COMPLIANCE = 'LEGAL_QUALITY_COMPLIANCE',
  COMPLAINT_HANDLING = 'COMPLAINT_HANDLING',
  CLIENT_FEEDBACK = 'CLIENT_FEEDBACK',
  GLOBAL_SUPPLY = 'GLOBAL_SUPPLY',
}

export enum EvaluationRecommendation {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  NEED_MORE_INFO = 'NEED_MORE_INFO',
  FIELD_VERIFICATION_REQUIRED = 'FIELD_VERIFICATION_REQUIRED',
}

export interface CriterionDefinition {
  criterion: EvaluationCriterion;
  label: string;
  description: string;
  maxScore: number;
  isOptional: boolean;
}

export const EVALUATION_CRITERIA: CriterionDefinition[] = [
  {
    criterion: EvaluationCriterion.EXPERIENCE_SCOPE,
    label: 'Experience & Scope of Supply',
    description:
      'Minimum 3 installations in last 5 years in design, manufacturing, supply & installation of APCDs for industrial Boiler/Furnaces/TFH',
    maxScore: 10,
    isOptional: false,
  },
  {
    criterion: EvaluationCriterion.TECHNICAL_SPECIFICATION,
    label: 'Technical Specification of APCDs',
    description:
      'Equipment type, design capacity, material of construction, pollution control efficiency, compliance standards, warranty & service, innovation',
    maxScore: 10,
    isOptional: false,
  },
  {
    criterion: EvaluationCriterion.TECHNICAL_TEAM,
    label: 'Technical Team & Capability',
    description:
      'Min 2 Engineers (B.Tech/M.Tech, 4yr + 2yr exp), Technicians (Diploma/ITI), Service team (>=2yr exp)',
    maxScore: 10,
    isOptional: false,
  },
  {
    criterion: EvaluationCriterion.FINANCIAL_STANDING,
    label: 'Financial Standing',
    description: 'Minimum average annual turnover from APCD business (last 3 years) > Rs 1 crore',
    maxScore: 10,
    isOptional: false,
  },
  {
    criterion: EvaluationCriterion.LEGAL_QUALITY_COMPLIANCE,
    label: 'Legal & Quality Compliance',
    description: 'ISO/BIS certifications (ISO 9001/14001), no ongoing legal disputes',
    maxScore: 10,
    isOptional: false,
  },
  {
    criterion: EvaluationCriterion.COMPLAINT_HANDLING,
    label: 'Customer Complaint Handling',
    description:
      'Documented grievance redressal, complaint response within 48 hrs, resolution within 15 days',
    maxScore: 10,
    isOptional: false,
  },
  {
    criterion: EvaluationCriterion.CLIENT_FEEDBACK,
    label: 'Client Feedback',
    description: 'Minimum 3 testimonials from APCD projects in last 3 years (1 from NCR preferred)',
    maxScore: 10,
    isOptional: false,
  },
  {
    criterion: EvaluationCriterion.GLOBAL_SUPPLY,
    label: 'Global Supply (Optional)',
    description:
      'Details of APCD projects abroad (Country, Year, Type, Compliance with CE/ISO/EU standards)',
    maxScore: 10,
    isOptional: true,
  },
];
