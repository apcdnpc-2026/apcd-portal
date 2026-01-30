'use client';

import {
  FileText,
  ClipboardCheck,
  Award,
  Users,
  ChevronRight,
  CheckCircle2,
  Clock,
  Shield,
  HelpCircle,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  const processSteps = [
    {
      step: 1,
      title: 'Register as OEM',
      description: 'Create your account with basic company details',
      icon: Users,
    },
    {
      step: 2,
      title: 'Complete Application',
      description: 'Fill the application form with required documents',
      icon: FileText,
    },
    {
      step: 3,
      title: 'Document Verification',
      description: 'NPC officers verify your submitted documents',
      icon: ClipboardCheck,
    },
    {
      step: 4,
      title: 'Field Verification',
      description: 'Physical verification of manufacturing facility',
      icon: Shield,
    },
    {
      step: 5,
      title: 'Committee Evaluation',
      description: 'Expert committee reviews your application',
      icon: Users,
    },
    {
      step: 6,
      title: 'Certificate Issuance',
      description: 'Receive empanelment certificate upon approval',
      icon: Award,
    },
  ];

  const apcdCategories = [
    'Electrostatic Precipitators (ESP)',
    'Bag Filters / Fabric Filters',
    'Wet Scrubbers',
    'Cyclone Separators',
    'Venturi Scrubbers',
    'Catalytic Converters',
    'Activated Carbon Adsorbers',
    'Thermal Oxidizers',
  ];

  const faqs = [
    {
      question: 'Who can apply for empanelment?',
      answer:
        'Manufacturers of Air Pollution Control Devices (APCDs) with valid GST registration and manufacturing facilities in India can apply.',
    },
    {
      question: 'What documents are required?',
      answer:
        'Company registration certificates, GST registration, manufacturing facility proof, product catalogs, test reports, and quality certifications.',
    },
    {
      question: 'How long does the process take?',
      answer:
        'The complete empanelment process typically takes 45-60 working days after submission of complete application.',
    },
    {
      question: 'What is the validity of the certificate?',
      answer:
        'The empanelment certificate is valid for 3 years from the date of issuance and can be renewed before expiry.',
    },
  ];

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
            <Link href="/empaneled-oems" className="hidden md:inline-block">
              <Button
                variant="outline"
                className="bg-transparent border-white text-white hover:bg-white hover:text-gov-blue"
              >
                Empaneled OEMs
              </Button>
            </Link>
            <Link href="/login">
              <Button
                variant="outline"
                size="sm"
                className="bg-transparent border-white text-white hover:bg-white hover:text-gov-blue text-xs sm:text-sm"
              >
                Login
              </Button>
            </Link>
            <Link href="/register">
              <Button
                size="sm"
                className="bg-white text-gov-blue hover:bg-blue-50 text-xs sm:text-sm"
              >
                Register
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-gov-blue to-blue-800 text-white py-10 sm:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">
              Air Pollution Control Device Manufacturers Empanelment
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-blue-100 mb-6 sm:mb-8">
              Get your company empaneled as an approved manufacturer of Air Pollution Control
              Devices under the Central Pollution Control Board (CPCB) guidelines.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link href="/register">
                <Button
                  size="lg"
                  className="bg-white text-gov-blue hover:bg-blue-50 w-full sm:w-auto"
                >
                  Start Application
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#process">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white text-white hover:bg-white/10 w-full sm:w-auto"
                >
                  View Process
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Online Application</h3>
                    <p className="text-sm text-muted-foreground">
                      Complete paperless process with online document submission
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Clock className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Track Progress</h3>
                    <p className="text-sm text-muted-foreground">
                      Real-time status updates and notifications at every stage
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Shield className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Secure & Transparent</h3>
                    <p className="text-sm text-muted-foreground">
                      Government-grade security with complete audit trail
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* APCD Categories */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">APCD Categories for Empanelment</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Manufacturers can apply for empanelment in the following Air Pollution Control Device
              categories
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
            {apcdCategories.map((category, index) => (
              <div key={index} className="flex items-center gap-2 p-4 bg-gray-50 rounded-lg border">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                <span className="text-sm">{category}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Steps */}
      <section id="process" className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Empanelment Process</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Follow these steps to get your company empaneled as an approved APCD manufacturer
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {processSteps.map((step) => (
              <Card key={step.step} className="relative">
                <CardHeader>
                  <div className="absolute -top-3 -left-3 w-8 h-8 bg-gov-blue text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {step.step}
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <step.icon className="h-5 w-5 text-gov-blue" />
                    </div>
                    <CardTitle className="text-lg">{step.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{step.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Required Documents */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Required Documents</h2>
              <p className="text-muted-foreground">
                Ensure you have the following documents ready before starting your application
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Company Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">
                        Certificate of Incorporation / Partnership Deed
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">GST Registration Certificate</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">PAN Card of Company</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">MSME/Udyam Registration (if applicable)</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Technical Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">Product Catalog with specifications</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">Test Reports from NABL accredited labs</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">ISO Certification (if available)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">
                        Installation experience proof (3+ installations)
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <Card key={index}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-3">
                      <HelpCircle className="h-5 w-5 text-gov-blue mt-0.5 flex-shrink-0" />
                      <CardTitle className="text-base font-medium">{faq.question}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="pl-11">
                    <p className="text-sm text-muted-foreground">{faq.answer}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 sm:py-16 bg-gov-blue text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-blue-100 mb-6 sm:mb-8 max-w-2xl mx-auto">
            Register now and begin your APCD OEM empanelment application. Our team is here to guide
            you through the process.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-white text-gov-blue hover:bg-blue-50 w-full sm:w-auto"
              >
                Register Now
                <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10 w-full sm:w-auto"
              >
                Already Registered? Login
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <h3 className="font-semibold mb-4">About</h3>
              <p className="text-sm text-gray-400">
                The APCD OEM Empanelment Portal is an initiative by the National Productivity
                Council for the Central Pollution Control Board to streamline the empanelment of Air
                Pollution Control Device manufacturers.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link href="/register" className="hover:text-white">
                    Register as OEM
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-white">
                    Login
                  </Link>
                </li>
                <li>
                  <Link href="/empaneled-oems" className="hover:text-white">
                    Empaneled OEMs
                  </Link>
                </li>
                <li>
                  <Link href="#process" className="hover:text-white">
                    Empanelment Process
                  </Link>
                </li>
                <li>
                  <a
                    href="https://cpcb.nic.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white"
                  >
                    CPCB Website
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Contact</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>National Productivity Council</li>
                <li>Utpadakta Bhawan, 5-6 Institutional Area</li>
                <li>Lodhi Road, New Delhi - 110003</li>
                <li>Email: apcd-support@npcindia.gov.in</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-6 text-center text-sm text-gray-400">
            <p>
              &copy; {new Date().getFullYear()} National Productivity Council. All rights reserved.
            </p>
            <p className="mt-1">For CPCB - Central Pollution Control Board</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
