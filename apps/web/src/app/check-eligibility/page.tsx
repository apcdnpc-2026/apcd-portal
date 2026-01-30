'use client';

import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Home,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormData {
  companyAge: number;
  firmType: string;
  hasGST: boolean | null;
  hasManufacturingFacility: boolean | null;
  isBlacklisted: boolean | null;
  annualTurnover: number;
  hasAuditedFinancials: boolean | null;
  hasISO9001: boolean | null;
  hasISO14001: boolean | null;
  hasISO45001: boolean | null;
  hasNABLReports: boolean | null;
  installationCount: number;
  hasGovtExperience: boolean | null;
  employeeCount: number;
  apcdCategories: string[];
}

const INITIAL_FORM: FormData = {
  companyAge: 0,
  firmType: '',
  hasGST: null,
  hasManufacturingFacility: null,
  isBlacklisted: null,
  annualTurnover: 0,
  hasAuditedFinancials: null,
  hasISO9001: null,
  hasISO14001: null,
  hasISO45001: null,
  hasNABLReports: null,
  installationCount: 0,
  hasGovtExperience: null,
  employeeCount: 0,
  apcdCategories: [],
};

const APCD_OPTIONS = [
  'Electrostatic Precipitators (ESP)',
  'Bag Filters / Fabric Filters',
  'Cyclone Separators',
  'Wet Scrubbers',
  'Dry Scrubbers',
  'Hybrid / Other Technologies',
  'Fume Extraction Systems',
];

const FIRM_TYPES = [
  'Proprietary',
  'Private Limited',
  'Limited Company',
  'Public Sector',
  'Society / Trust',
];

// ─── Scoring Logic ───────────────────────────────────────────────────────────

interface MandatoryResult {
  label: string;
  passed: boolean;
}

interface BonusResult {
  label: string;
  earned: number;
  max: number;
  met: boolean;
}

function evaluateMandatory(data: FormData): MandatoryResult[] {
  return [
    { label: 'Company must be at least 3 years old', passed: data.companyAge >= 3 },
    { label: 'Annual turnover must be at least \u20B95 Crore', passed: data.annualTurnover >= 5 },
    { label: 'Company must be GST registered', passed: data.hasGST === true },
    { label: 'Company must not be blacklisted', passed: data.isBlacklisted === false },
    {
      label: 'Must have manufacturing facility in India',
      passed: data.hasManufacturingFacility === true,
    },
    { label: 'Minimum 3 APCD installations', passed: data.installationCount >= 3 },
  ];
}

function evaluateBonus(data: FormData): BonusResult[] {
  const hasAnyISO =
    data.hasISO9001 === true || data.hasISO14001 === true || data.hasISO45001 === true;
  return [
    { label: 'ISO Certification', earned: hasAnyISO ? 15 : 0, max: 15, met: hasAnyISO },
    {
      label: 'NABL Test Reports',
      earned: data.hasNABLReports === true ? 15 : 0,
      max: 15,
      met: data.hasNABLReports === true,
    },
    {
      label: 'Government Project Experience',
      earned: data.hasGovtExperience === true ? 15 : 0,
      max: 15,
      met: data.hasGovtExperience === true,
    },
    {
      label: 'Audited Financial Statements',
      earned: data.hasAuditedFinancials === true ? 10 : 0,
      max: 10,
      met: data.hasAuditedFinancials === true,
    },
    {
      label: 'Strong Turnover (\u226525 Crore)',
      earned: data.annualTurnover >= 25 ? 10 : 0,
      max: 10,
      met: data.annualTurnover >= 25,
    },
    {
      label: 'Extensive Installations (\u226510)',
      earned: data.installationCount >= 10 ? 10 : 0,
      max: 10,
      met: data.installationCount >= 10,
    },
    {
      label: 'Multiple APCD Categories (\u22653)',
      earned: data.apcdCategories.length >= 3 ? 10 : 0,
      max: 10,
      met: data.apcdCategories.length >= 3,
    },
    {
      label: 'Large Workforce (\u226550 employees)',
      earned: data.employeeCount >= 50 ? 5 : 0,
      max: 5,
      met: data.employeeCount >= 50,
    },
    {
      label: 'Additional ISO Certifications',
      earned:
        [data.hasISO9001, data.hasISO14001, data.hasISO45001].filter(Boolean).length >= 2 ? 10 : 0,
      max: 10,
      met: [data.hasISO9001, data.hasISO14001, data.hasISO45001].filter(Boolean).length >= 2,
    },
  ];
}

const REQUIRED_DOCUMENTS = [
  'Certificate of Incorporation',
  'GST Registration Certificate',
  'PAN Card',
  'Latest Audited Financial Statements',
  'Company Profile',
  'Board Resolution for Empanelment',
  'ISO Certificates',
  'MSME Certificate (if applicable)',
  'Work Order Copies / Installation Proof',
];

// ─── Components ──────────────────────────────────────────────────────────────

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-3">
        <Button
          type="button"
          variant={value === true ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(true)}
        >
          Yes
        </Button>
        <Button
          type="button"
          variant={value === false ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(false)}
        >
          No
        </Button>
      </div>
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;
        return (
          <div key={i} className="flex items-center">
            <div
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                isActive
                  ? 'bg-gov-blue text-white'
                  : isDone
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {isDone ? <CheckCircle2 className="h-5 w-5" /> : stepNum}
            </div>
            {i < total - 1 && (
              <div
                className={`w-6 sm:w-10 md:w-16 h-1 ${isDone ? 'bg-green-500' : 'bg-gray-200'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CheckEligibilityPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({ ...INITIAL_FORM });

  const totalSteps = 5;

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleCategory = (cat: string) => {
    setForm((prev) => ({
      ...prev,
      apcdCategories: prev.apcdCategories.includes(cat)
        ? prev.apcdCategories.filter((c) => c !== cat)
        : [...prev.apcdCategories, cat],
    }));
  };

  const mandatoryResults = evaluateMandatory(form);
  const allMandatoryPass = mandatoryResults.every((m) => m.passed);
  const bonusResults = evaluateBonus(form);
  const bonusScore = bonusResults.reduce((sum, b) => sum + b.earned, 0);
  const totalScore = allMandatoryPass ? bonusScore : 0;
  const maxBonus = bonusResults.reduce((sum, b) => sum + b.max, 0);

  let resultStatus: string;
  let resultColor: string;
  let resultMessage: string;
  if (!allMandatoryPass) {
    resultStatus = 'Not Eligible';
    resultColor = 'red';
    resultMessage = 'Your company does not meet the mandatory requirements for empanelment.';
  } else if (totalScore >= 70) {
    resultStatus = 'Highly Eligible';
    resultColor = 'green';
    resultMessage = 'Your company is well-positioned for empanelment.';
  } else if (totalScore >= 40) {
    resultStatus = 'Eligible';
    resultColor = 'blue';
    resultMessage = 'Your company meets requirements with a reasonable profile.';
  } else {
    resultStatus = 'Marginally Eligible';
    resultColor = 'amber';
    resultMessage =
      'Your company meets minimum requirements but consider strengthening your profile before applying.';
  }

  const colorMap: Record<string, { bg: string; text: string; border: string; ring: string }> = {
    green: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-300',
      ring: 'text-green-500',
    },
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-300',
      ring: 'text-blue-500',
    },
    amber: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-300',
      ring: 'text-amber-500',
    },
    red: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-300',
      ring: 'text-red-500',
    },
  };
  const colors = colorMap[resultColor];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Government Header */}
      <div className="gov-stripe" />
      <header className="bg-gov-blue text-white py-3 sm:py-4 sticky top-0 z-50">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-white flex items-center justify-center flex-shrink-0">
              <span className="text-gov-blue font-bold text-xs sm:text-sm">NPC</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-xl font-bold truncate">APCD OEM Empanelment Portal</h1>
              <p className="text-xs sm:text-sm text-blue-200 hidden sm:block">
                National Productivity Council for CPCB
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="bg-transparent border-white text-white hover:bg-white hover:text-gov-blue text-xs sm:text-sm"
              >
                Home
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="sm"
                className="bg-white text-gov-blue hover:bg-blue-50 text-xs sm:text-sm"
              >
                Login
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-3xl mx-auto">
            {/* Title */}
            <div className="mb-6 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Eligibility Checker</h2>
              <p className="text-muted-foreground">
                Check if your company meets the requirements for APCD OEM empanelment
              </p>
            </div>

            <StepIndicator current={step} total={totalSteps} />

            {/* Step 1: Company Details */}
            {step === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 1: Company Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Company Age (years since incorporation)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.companyAge || ''}
                      onChange={(e) => update('companyAge', Number(e.target.value))}
                      placeholder="e.g. 5"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Type of Firm</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {FIRM_TYPES.map((ft) => (
                        <Button
                          key={ft}
                          type="button"
                          variant={form.firmType === ft ? 'default' : 'outline'}
                          size="sm"
                          className="justify-start"
                          onClick={() => update('firmType', ft)}
                        >
                          {ft}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <YesNoField
                    label="Do you have GST registration?"
                    value={form.hasGST}
                    onChange={(v) => update('hasGST', v)}
                  />

                  <YesNoField
                    label="Do you have a manufacturing facility in India?"
                    value={form.hasManufacturingFacility}
                    onChange={(v) => update('hasManufacturingFacility', v)}
                  />

                  <YesNoField
                    label="Any blacklisting / debarment history?"
                    value={form.isBlacklisted}
                    onChange={(v) => update('isBlacklisted', v)}
                  />
                </CardContent>
              </Card>
            )}

            {/* Step 2: Financial Details */}
            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 2: Financial Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Annual Turnover (in \u20B9 Crore)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      value={form.annualTurnover || ''}
                      onChange={(e) => update('annualTurnover', Number(e.target.value))}
                      placeholder="e.g. 10"
                    />
                  </div>

                  <YesNoField
                    label="Do you have audited financial statements for the last 3 years?"
                    value={form.hasAuditedFinancials}
                    onChange={(v) => update('hasAuditedFinancials', v)}
                  />
                </CardContent>
              </Card>
            )}

            {/* Step 3: Compliance & Quality */}
            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 3: Compliance & Quality</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <YesNoField
                    label="Do you have ISO 9001 certification?"
                    value={form.hasISO9001}
                    onChange={(v) => update('hasISO9001', v)}
                  />
                  <YesNoField
                    label="Do you have ISO 14001 certification?"
                    value={form.hasISO14001}
                    onChange={(v) => update('hasISO14001', v)}
                  />
                  <YesNoField
                    label="Do you have ISO 45001 certification?"
                    value={form.hasISO45001}
                    onChange={(v) => update('hasISO45001', v)}
                  />
                  <YesNoField
                    label="Do you have NABL-accredited test reports?"
                    value={form.hasNABLReports}
                    onChange={(v) => update('hasNABLReports', v)}
                  />
                </CardContent>
              </Card>
            )}

            {/* Step 4: Experience */}
            {step === 4 && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 4: Experience</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Number of APCD installations completed</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.installationCount || ''}
                      onChange={(e) => update('installationCount', Number(e.target.value))}
                      placeholder="e.g. 5"
                    />
                  </div>

                  <YesNoField
                    label="Do you have government project experience?"
                    value={form.hasGovtExperience}
                    onChange={(v) => update('hasGovtExperience', v)}
                  />

                  <div className="space-y-2">
                    <Label>Number of employees</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.employeeCount || ''}
                      onChange={(e) => update('employeeCount', Number(e.target.value))}
                      placeholder="e.g. 25"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Which APCD categories do you manufacture?</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {APCD_OPTIONS.map((cat) => (
                        <Button
                          key={cat}
                          type="button"
                          variant={form.apcdCategories.includes(cat) ? 'default' : 'outline'}
                          size="sm"
                          className="justify-start text-left h-auto py-2"
                          onClick={() => toggleCategory(cat)}
                        >
                          {form.apcdCategories.includes(cat) ? (
                            <CheckCircle2 className="h-4 w-4 mr-2 flex-shrink-0" />
                          ) : (
                            <div className="h-4 w-4 mr-2 flex-shrink-0 rounded-full border" />
                          )}
                          {cat}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 5: Result */}
            {step === 5 && (
              <div className="space-y-6">
                {/* Score Card */}
                <Card className={`${colors.border} border-2`}>
                  <CardContent className="py-8 text-center">
                    <div
                      className={`mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center ${colors.bg}`}
                    >
                      {allMandatoryPass ? (
                        <CheckCircle2 className={`h-10 w-10 ${colors.ring}`} />
                      ) : (
                        <XCircle className={`h-10 w-10 ${colors.ring}`} />
                      )}
                    </div>
                    <h3 className={`text-2xl font-bold ${colors.text}`}>{resultStatus}</h3>
                    <p className="text-muted-foreground mt-1">{resultMessage}</p>

                    {allMandatoryPass && (
                      <div className="mt-6 inline-flex items-center gap-4 px-6 py-3 rounded-lg bg-white border shadow-sm">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Eligibility Score</p>
                          <p className={`text-3xl font-bold ${colors.text}`}>{totalScore}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Out of</p>
                          <p className="text-3xl font-bold text-gray-400">{maxBonus}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex flex-wrap justify-center gap-3">
                  {allMandatoryPass && (
                    <Link href="/register">
                      <Button className="bg-gov-blue hover:bg-blue-800">
                        Start Empanelment Application <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setForm({ ...INITIAL_FORM });
                      setStep(1);
                    }}
                  >
                    <RotateCcw className="mr-1 h-4 w-4" /> Start Over
                  </Button>
                  <Link href="/">
                    <Button variant="outline">
                      <Home className="mr-1 h-4 w-4" /> Back to Home
                    </Button>
                  </Link>
                </div>

                {/* Mandatory + Bonus Breakdown */}
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Mandatory Requirements */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Mandatory Requirements
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {mandatoryResults.map((req, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-3 p-2 rounded-lg ${req.passed ? 'bg-green-50' : 'bg-red-50'}`}
                        >
                          {req.passed ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                          )}
                          <span
                            className={`text-sm ${req.passed ? 'text-green-700' : 'text-red-700'}`}
                          >
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Score Breakdown */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        Score Breakdown
                      </CardTitle>
                      {allMandatoryPass && (
                        <p className="text-xs text-muted-foreground">
                          Points earned based on your company profile
                        </p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {!allMandatoryPass ? (
                        <p className="text-sm text-muted-foreground">
                          Score breakdown is only available when all mandatory requirements are met.
                        </p>
                      ) : (
                        <>
                          {bonusResults.map((bonus, i) => (
                            <div
                              key={i}
                              className={`flex items-center justify-between p-2 rounded-lg ${bonus.met ? 'bg-green-50' : 'bg-gray-50'}`}
                            >
                              <div className="flex items-center gap-2">
                                {bonus.met ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                                )}
                                <span
                                  className={`text-sm ${bonus.met ? 'text-green-700' : 'text-gray-500'}`}
                                >
                                  {bonus.label}
                                </span>
                              </div>
                              <Badge
                                className={
                                  bonus.met
                                    ? 'bg-green-100 text-green-700 border-green-300'
                                    : 'bg-gray-100 text-gray-400 border-gray-200'
                                }
                              >
                                {bonus.met ? `+${bonus.earned}` : `0`} / {bonus.max}
                              </Badge>
                            </div>
                          ))}
                          <div className="flex items-center justify-between pt-2 border-t font-medium">
                            <span className={`text-sm ${colors.text}`}>Total Score</span>
                            <span className={`text-sm ${colors.text}`}>
                              {totalScore} / {maxBonus}
                            </span>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Required Documents */}
                {allMandatoryPass && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Required Documents for Application
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Based on your responses, you will need to submit the following documents
                        when applying
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {REQUIRED_DOCUMENTS.map((doc, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border"
                          >
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gov-blue text-white text-xs font-bold flex-shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-sm">{doc}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Navigation Buttons */}
            {step < 5 && (
              <div className="flex justify-between mt-6">
                <Button
                  variant="outline"
                  onClick={() => (step === 1 ? null : setStep(step - 1))}
                  disabled={step === 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                </Button>
                <Button onClick={() => setStep(step + 1)}>
                  {step === 4 ? 'View Result' : 'Next'} <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-4">
        <div className="container mx-auto px-4 text-center text-sm">
          <p>
            &copy; {new Date().getFullYear()} National Productivity Council. All rights reserved.
          </p>
          <p className="text-gray-400 mt-1">For CPCB - Central Pollution Control Board</p>
        </div>
      </footer>
    </div>
  );
}
