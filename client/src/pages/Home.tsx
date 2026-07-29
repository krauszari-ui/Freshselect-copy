import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Leaf,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Store,
  Heart,
  UtensilsCrossed,
  Phone,
  Mail,
  AlertCircle,
  Baby,
  Calendar,
  Upload,
  FileText,
  X,
  Users,
  ClipboardList,
  Apple,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SignaturePad } from "@/components/SignaturePad";
import { DobPicker } from "@/components/DobPicker";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface HouseholdMember {
  name: string;
  dateOfBirth: string;
  medicaidId: string;
  relationship: string;
}

interface ScreeningQuestions {
  livingSituation: string;
  utilityShutoff: string;
  receivesSnap: string;
  receivesWic: string;
  receivesTanf: string;
  enrolledHealthHome: string;
  householdMembersCount: string;
  householdMembersWithMedicaid: string;
  needsWorkAssistance: string;
  wantsSchoolHelp: string;
  transportationBarrier: string;
  medicationsRequireRefrigeration: string;
  pregnantOrPostpartum: string;
  breastmilkRefrigeration: string;
}

interface FormData {
  neighborhood: string;
  supermarket: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  medicaidId: string;
  cellPhone: string;
  homePhone: string;
  email: string;
  streetAddress: string;
  aptUnit: string;
  city: string;
  state: string;
  zipcode: string;
  healthCategories: string[];
  conditionClientNames: Record<string, string>; // { [conditionKey]: clientName }
  otherConditionDescription: string;
  dueDate: string;
  miscarriageDate: string;
  infantName: string;
  infantDateOfBirth: string;
  infantMedicaidId: string;
  employed: string;
  spouseEmployed: string;
  hasWic: string;
  hasSnap: string;
  foodAllergies: string;
  foodAllergiesDetails: string;
  dietaryRestrictions: string;
  newApplicant: string;
  transferAgencyName: string;
  additionalMembersCount: string;
  householdMembers: HouseholdMember[];
  mealFocus: string[];
  breakfastItems: string;
  lunchItems: string;
  dinnerItems: string;
  snackItems: string;
  needsRefrigerator: string;
  needsMicrowave: string;
  needsCookingUtensils: string;
  hipaaConsent: boolean;
  guardianName: string;
  signatureDataUrl: string;
  screeningQuestions: ScreeningQuestions;
}

type FormErrors = Partial<Record<string, string>>;

interface UploadedDoc {
  url: string;
  key: string;
  fileName: string;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const INITIAL_SCREENING: ScreeningQuestions = {
  livingSituation: "",
  utilityShutoff: "",
  receivesSnap: "",
  receivesWic: "",
  receivesTanf: "",
  enrolledHealthHome: "",
  householdMembersCount: "",
  householdMembersWithMedicaid: "",
  needsWorkAssistance: "",
  wantsSchoolHelp: "",
  transportationBarrier: "",
  medicationsRequireRefrigeration: "",
  pregnantOrPostpartum: "",
  breastmilkRefrigeration: "",
};

const INITIAL_FORM: FormData = {
  neighborhood: "",
  supermarket: "",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  medicaidId: "",
  cellPhone: "",
  homePhone: "",
  email: "",
  streetAddress: "",
  aptUnit: "",
  city: "Brooklyn",
  state: "NY",
  zipcode: "",
  healthCategories: [],
  conditionClientNames: {},
  otherConditionDescription: "",
  dueDate: "",
  miscarriageDate: "",
  infantName: "",
  infantDateOfBirth: "",
  infantMedicaidId: "",
  employed: "",
  spouseEmployed: "",
  hasWic: "",
  hasSnap: "",
  foodAllergies: "",
  foodAllergiesDetails: "",
  dietaryRestrictions: "",
  newApplicant: "",
  transferAgencyName: "",
  additionalMembersCount: "",
  householdMembers: [],
  mealFocus: [],
  breakfastItems: "",
  lunchItems: "",
  dinnerItems: "",
  snackItems: "",
  needsRefrigerator: "",
  needsMicrowave: "",
  needsCookingUtensils: "",
  hipaaConsent: false,
  guardianName: "",
  signatureDataUrl: "",
  screeningQuestions: { ...INITIAL_SCREENING },
};

const NEIGHBORHOODS = [
  {
    name: "Williamsburg",
    vendors: [
      { name: "Foodoo Kosher", address: "249 Wallabout St, Brooklyn, NY 11206", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/foodoo-logo_4f53a2c6.png" },
      { name: "Rosemary Kosher", address: "392 Flushing Ave, Brooklyn, NY 11205", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/rosemary-logo_a286acb8.webp" },
      { name: "Chestnut", address: "700 Myrtle Ave, Brooklyn, NY 11205", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/chestnut-store_b43a49f5.jpg" },
      { name: "Central Market", address: "50 Division Ave, Brooklyn, NY 11249", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/central-market-store_1b7c6b82.jpg" },
      { name: "One Stop Kosher", address: "98 Rutledge St, Brooklyn, NY 11249", logo: "/logos/one-stop-kosher.jpg" },
    ],
  },
  {
    name: "Borough Park",
    vendors: [
      { name: "KRM", address: "1325 39th St, Brooklyn, NY 11218", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/krm-logo_edb72947.webp" },
      { name: "Certo Market", address: "1274 39th St, Brooklyn, NY 11218", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/certo-logo_061b67cf.jpg" },
      { name: "Breadberry", address: "1689 60th St, Brooklyn, NY 11204", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/breadberry-logo_fb38d917.jpg" },
    ],
  },
  {
    name: "Flatbush",
    vendors: [
      { name: "Pomegranate", address: "1507 Coney Island Ave, Brooklyn, NY 11230", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/pomegranate-logo_9c9b8a9e.png" },
      { name: "Moisha's Discount", address: "325 Avenue M, Brooklyn, NY 11230", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/moishas-logo_bc71f759.png" },
    ],
  },
  {
    name: "Monsey",
    vendors: [
      { name: "Evergreen", address: "59 NY-59, Monsey, NY 10952", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/evergreen-logo_7c3a66e5.png" },
      { name: "Hatzlacha", address: "80 West St, Spring Valley, NY 10977", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/hatzlacha-logo_7eaaa1a4.jpg" },
    ],
  },
  {
    name: "Monroe",
    vendors: [
      { name: "Refresh", address: "52 Bakertown Rd, Monroe, NY 10950", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/refresh-logo_d7e96b49.png" },
      { name: "Landau's", address: "51 Forest Rd, Monroe, NY 10950", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663225242016/aXnNnkD6gAXcPtQ6Yw2PQJ/landaus-logo_13de03b0.png" },
    ],
  },
];

const ALL_VENDORS = NEIGHBORHOODS.flatMap((n) => n.vendors.map((v) => ({ ...v, neighborhood: n.name })));

const HEALTH_CATEGORIES = [
  "Pregnant",
  "Had a Miscarriage",
  "Postpartum (Within the last 12 months)",
  "Substance Use Disorder",
  "HIV / AIDS",
  "Diabetes",
  "Hypertension",
  "Serious Mental Illness (SMI)",
  "Chronic Condition",
  "Other",
];

// Categories that require a client name + supporting document upload
const MEDICAL_CONDITION_CATEGORIES = [
  "HIV / AIDS",
  "Hypertension",
  "Chronic Condition",
  "Substance Use Disorder",
  "Diabetes",
  "Serious Mental Illness (SMI)",
];

const STEP_LABELS = [
  "Personal Info",
  "Screening & Health",
  "Meals & Preferences",
  "Vendor Selection",
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function validateStep1(form: FormData): FormErrors {
  const e: FormErrors = {};
  if (!form.firstName.trim()) e.firstName = "First name is required";
  if (!form.lastName.trim()) e.lastName = "Last name is required";
  if (!form.dateOfBirth.trim()) e.dateOfBirth = "Date of birth is required";
  if (!form.medicaidId.trim()) e.medicaidId = "Medicaid ID is required";
  else if (!/^[A-Za-z]{2}\d{5}[A-Za-z]$/.test(form.medicaidId))
    e.medicaidId = "Format: 2 letters, 5 digits, 1 letter (e.g. AB12345C)";
  if (!form.cellPhone.trim()) e.cellPhone = "Phone number is required";
  else if (!/^\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/.test(form.cellPhone.trim()))
    e.cellPhone = "Enter a valid 10-digit phone number";
  if (!form.email.trim()) e.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    e.email = "Enter a valid email address";
  if (!form.streetAddress.trim()) e.streetAddress = "Street address is required";
  if (!form.city.trim()) e.city = "City is required";
  if (!form.state.trim()) e.state = "State is required";
  if (!form.zipcode.trim()) e.zipcode = "Zipcode is required";
  return e;
}

function validateStep2(form: FormData, uploads?: Record<string, { url: string; fileName: string }>): FormErrors {
  const e: FormErrors = {};
  const sq = form.screeningQuestions;
  // Screening questions (kept: 1-4 and 5-8 renumbered)
  if (!sq.livingSituation) e["sq.livingSituation"] = "Required";
  if (!sq.utilityShutoff) e["sq.utilityShutoff"] = "Required";
  if (!sq.receivesSnap) e["sq.receivesSnap"] = "Required";
  if (!sq.receivesWic) e["sq.receivesWic"] = "Required";
  if (!sq.enrolledHealthHome) e["sq.enrolledHealthHome"] = "Required";
  if (!sq.householdMembersCount.trim()) e["sq.householdMembersCount"] = "Required";
  if (!sq.householdMembersWithMedicaid.trim()) e["sq.householdMembersWithMedicaid"] = "Required";
  if (!sq.medicationsRequireRefrigeration) e["sq.medicationsRequireRefrigeration"] = "Required";
  if (!sq.breastmilkRefrigeration) e["sq.breastmilkRefrigeration"] = "Required";
  // Health categories required
  if (form.healthCategories.length === 0) e.healthCategories = "Please select at least one health category";
  if (!form.employed) e.employed = "Required";
  if (!form.spouseEmployed) e.spouseEmployed = "Required";
  if (!form.newApplicant) e.newApplicant = "Required";
  // Transfer agency name required when transferring
  if (form.newApplicant === "Transfer" && !form.transferAgencyName.trim()) e.transferAgencyName = "Agency name is required for transfers";
  // Medical condition categories: require client name + document
  const selectedMedical = form.healthCategories.filter((c) => MEDICAL_CONDITION_CATEGORIES.includes(c));
  for (const condition of selectedMedical) {
    if (!form.conditionClientNames[condition]?.trim()) {
      e[`conditionName_${condition}`] = `Client name for ${condition} is required`;
    }
    // Document upload is preferred but not required
  }
  // Other: require description + document
  if (form.healthCategories.includes("Other")) {
    if (!form.otherConditionDescription.trim()) {
      e.otherConditionDescription = "Please describe the condition";
    }
    // Document upload for Other is preferred but not required
  }
  // Conditional health fields
  if (form.healthCategories.includes("Pregnant") && !form.dueDate)
    e.dueDate = "Due date is required";
  if (form.healthCategories.includes("Had a Miscarriage") && !form.miscarriageDate)
    e.miscarriageDate = "Date of miscarriage is required";
  if (form.healthCategories.includes("Postpartum (Within the last 12 months)")) {
    if (!form.infantName.trim()) e.infantName = "Infant name is required";
    if (!form.infantDateOfBirth) e.infantDateOfBirth = "Infant DOB is required";
    if (!form.infantMedicaidId.trim()) e.infantMedicaidId = "Infant Medicaid ID is required";
  }
  return e;
}

function validateStep3(form: FormData): FormErrors {
  const e: FormErrors = {};
  // Household members required — "0" (None) is a valid selection
  if (form.additionalMembersCount === "") e.householdMembers = "Please select the number of household members";
  // Each member must have a name, DOB, and Medicaid ID
  const missingName = form.householdMembers.some((m) => !m.name.trim());
  if (missingName) e.householdMembers = "Please enter the full name for every household member";
  const missingDob = form.householdMembers.some((m) => !m.dateOfBirth.trim());
  if (!missingName && missingDob) {
    e.householdMembers = "Please enter the date of birth for every household member";
  }
  const missingMedicaid = form.householdMembers.some((m) => !m.medicaidId.trim());
  if (!missingName && !missingDob && missingMedicaid) e.householdMembers = "Please enter the Medicaid ID for every household member";
  if (form.mealFocus.length === 0) e.mealFocus = "Select at least one meal type";
  if (!form.needsRefrigerator) e.needsRefrigerator = "Required";
  if (!form.needsMicrowave) e.needsMicrowave = "Required";
  if (!form.needsCookingUtensils) e.needsCookingUtensils = "Required";
  if (!form.hipaaConsent) e.hipaaConsent = "You must agree to the HIPAA consent";
  if (!form.guardianName.trim()) e.guardianName = "Please enter the member/parent/guardian name";
  if (!form.signatureDataUrl) e.signatureDataUrl = "Please provide your electronic signature";
  return e;
}

function validateStep4(form: FormData): FormErrors {
  const e: FormErrors = {};
  if (!form.neighborhood) e.neighborhood = "Please select a neighborhood";
  else if (!form.supermarket) e.supermarket = "Please select a vendor";
  return e;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Auto-format a raw DOB input string into MM/DD/YYYY as the user types. */
function formatDob(raw: string): string {
  // Strip everything that isn't a digit
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/* ─── Components ─────────────────────────────────────────────────────────── */

function YesNoSelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={error ? "border-red-400" : ""}>
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Yes">Yes</SelectItem>
          <SelectItem value="No">No</SelectItem>
        </SelectContent>
      </Select>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

function FileUploadField({
  label,
  category,
  uploads,
  setUploads,
  uploading,
  setUploading,
}: {
  label: string;
  category: string;
  uploads: Record<string, UploadedDoc>;
  setUploads: React.Dispatch<React.SetStateAction<Record<string, UploadedDoc>>>;
  uploading: Record<string, boolean>;
  setUploading: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const uploadMutation = trpc.upload.document.useMutation();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("File must be under 3MB. Please compress or reduce the file size and try again.");
      return;
    }

    setUploading((prev) => ({ ...prev, [category]: true }));
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.readAsDataURL(file);
      });

      const result = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type,
        category,
      });

      setUploads((prev) => ({
        ...prev,
        [category]: { url: result.url, key: result.key, fileName: file.name },
      }));
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed. Please try again.");
    } finally {
      setUploading((prev) => ({ ...prev, [category]: false }));
    }
  };

  const uploaded = uploads[category];
  const isUploading = uploading[category];

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-stone-700">{label}</Label>
      {uploaded ? (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <FileText className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-700 truncate flex-1">{uploaded.fileName}</span>
          <button
            type="button"
            onClick={() => {
              setUploads((prev) => {
                const next = { ...prev };
                delete next[category];
                return next;
              });
            }}
            className="text-red-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-stone-300 rounded-lg cursor-pointer hover:border-green-500 hover:bg-green-50/50 transition-colors"
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin text-green-600" />
          ) : (
            <>
              <Upload className="w-5 h-5 text-stone-400" />
              <span className="text-sm text-stone-500">Click to upload (max 3MB)</span>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}

/* ─── Landing Page ───────────────────────────────────────────────────────── */

function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-700 rounded-xl flex items-center justify-center shrink-0">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-green-800 font-serif leading-tight">FreshSelect Meals</h1>
              <p className="text-xs text-stone-500 hidden sm:block">SCN Approved Vendor</p>
            </div>
          </div>
          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center gap-4">
            <a href="tel:7183074664" className="flex items-center gap-1.5 text-stone-600 hover:text-green-700 text-sm">
              <Phone className="w-4 h-4" /> (718) 307-4664
            </a>
            <a href="mailto:info@freshselectmeals.com" className="flex items-center gap-1.5 text-stone-600 hover:text-green-700 text-sm">
              <Mail className="w-4 h-4" /> info@freshselectmeals.com
            </a>
          </div>
          {/* Mobile: phone icon only */}
          <div className="flex sm:hidden items-center gap-2">
            <a href="tel:7183074664" className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-50 text-green-700">
              <Phone className="w-5 h-5" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-green-800 via-green-700 to-green-900" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-64 h-64 bg-yellow-400 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-80 h-80 bg-green-400 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 py-12 md:py-28 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white font-serif leading-tight mb-4 md:mb-6">
            Free Nutritious Meals and Food Support for Our Community
          </h2>
          <p className="text-base md:text-xl text-green-100 max-w-3xl mx-auto mb-6 md:mb-8 leading-relaxed">
            If you are struggling to put healthy food on the table or have a medical condition that makes preparing meals difficult, we are here to help. Through the <strong className="text-white">New York Social Care Network (SCN)</strong> program, we provide free, home-delivered meals and grocery support to eligible Medicaid members.
          </p>
          <Button
            onClick={onStart}
            size="lg"
            className="bg-amber-500 hover:bg-amber-600 text-white text-base md:text-lg px-8 md:px-10 py-5 md:py-6 rounded-xl shadow-lg hover:shadow-xl transition-all font-semibold w-full sm:w-auto"
          >
            Start My Free Screening <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
          <p className="text-green-200 text-sm mt-4">
            100% voluntary. Will not affect your Medicaid eligibility.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h3 className="text-2xl md:text-3xl font-bold text-green-800 font-serif text-center mb-12">How the Program Works</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {[
            { step: "1", title: "Screening", desc: "Take a quick survey to identify your food needs.", icon: ClipboardList },
            { step: "2", title: "Eligibility Check", desc: "We verify your Medicaid status and clinical needs.", icon: ShieldCheck },
            { step: "3", title: "Nutrition Plan", desc: "We refer you to the food program that fits your life.", icon: Apple },
            { step: "4", title: "Delivery", desc: "Begin receiving meals or grocery vouchers at no cost.", icon: Store },
          ].map((item) => (
            <Card key={item.step} className="border-stone-200 hover:border-green-300 hover:shadow-md transition-all">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-6 h-6 text-green-700" />
                </div>
                <div className="text-xs font-bold text-amber-600 mb-1">STEP {item.step}</div>
                <h4 className="font-bold text-stone-800 mb-2">{item.title}</h4>
                <p className="text-sm text-stone-600">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Eligibility */}
      <section className="bg-stone-50 py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h3 className="text-2xl md:text-3xl font-bold text-green-800 font-serif text-center mb-8">Who is Eligible?</h3>
          <p className="text-center text-stone-600 mb-10 max-w-3xl mx-auto">
            To receive Enhanced Nutrition Services, you must meet the following criteria:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            {[
              { title: "Medicaid Status", desc: "Enrolled in Medicaid Managed Care (mainstream plans, HIV-SNPs, or HARP)." },
              { title: "Identified Need", desc: "Screen positive for an unmet need regarding food security." },
              { title: "Priority Group", desc: "Pregnant/Postpartum, High-Risk Children, Chronic Conditions, SUD, SMI, or High Utilizers." },
              { title: "Clinical Necessity", desc: "For certain programs, a medical provider confirms services are medically appropriate." },
            ].map((item) => (
              <Card key={item.title} className="border-stone-200">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="font-bold text-stone-800 mb-1">{item.title}</h4>
                      <p className="text-sm text-stone-600">{item.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Programs */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h3 className="text-2xl md:text-3xl font-bold text-green-800 font-serif text-center mb-12">Our Nutrition Programs</h3>
        <div className="space-y-4">
          {[
            { title: "Medically Tailored Meals (MTM)", desc: "Meals designed by a Registered Dietitian for your specific medical needs, delivered to your home." },
            { title: "Clinically Appropriate Home-Delivered Meals", desc: "For those who cannot prepare meals but do not require specific medical tailoring." },
            { title: "Food Prescriptions", desc: "Weekly food boxes or vouchers for produce, meat, and grains at local markets." },
            { title: "Pantry Stocking", desc: "Fresh produce and healthy groceries delivered to your home (pregnant/postpartum and high-risk children)." },
            { title: "Cooking Supplies", desc: "Essential kitchenware (pots, pans, utensils) or even a refrigerator if needed." },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-4 p-4 rounded-lg hover:bg-stone-50 transition-colors">
              <Heart className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-bold text-stone-800">{item.title}</h4>
                <p className="text-sm text-stone-600">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-800 py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h3 className="text-2xl md:text-3xl font-bold text-white font-serif mb-4">Get Started Today</h3>
          <p className="text-green-100 mb-8">Ready to see if you qualify? Take our secure Self-Screening Survey.</p>
          <Button
            onClick={onStart}
            size="lg"
            className="bg-amber-500 hover:bg-amber-600 text-white text-base md:text-lg px-8 md:px-10 py-5 md:py-6 rounded-xl shadow-lg w-full sm:w-auto"
          >
            Start My Free Screening <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
          <p className="text-green-200 text-sm mt-4">
            Your information is protected by strict privacy and security laws.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <h3 className="text-xl font-bold text-green-800 font-serif text-center mb-6">Contact Us</h3>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-stone-600">
          <a href="tel:7183074664" className="flex items-center gap-2 hover:text-green-700">
            <Phone className="w-5 h-5" /> (718) 307-4664
          </a>
          <a href="mailto:info@freshselectmeals.com" className="flex items-center gap-2 hover:text-green-700">
            <Mail className="w-5 h-5" /> info@freshselectmeals.com
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 py-6">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-stone-500">
          <div className="flex items-center gap-2">
            <Leaf className="w-4 h-4 text-green-600" />
            <span>FreshSelect Meals</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-green-700">Privacy Policy</a>
            <span>&copy; {new Date().getFullYear()} FreshSelect Meals</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Progress Bar ───────────────────────────────────────────────────────── */

function ProgressBar({ step, totalSteps }: { step: number; totalSteps: number }) {
  return (
    <div className="w-full max-w-2xl mx-auto mb-8">
      <div className="flex items-center justify-between mb-3">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex flex-col items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                i + 1 < step
                  ? "bg-green-600 text-white"
                  : i + 1 === step
                  ? "bg-amber-500 text-white ring-4 ring-amber-200"
                  : "bg-stone-200 text-stone-500"
              }`}
            >
              {i + 1 < step ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
            </div>
            <span className={`text-xs mt-1 hidden sm:block ${i + 1 === step ? "text-amber-600 font-semibold" : "text-stone-500"}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-green-600 to-green-500 rounded-full transition-all duration-500"
          style={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function Home() {
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({ ...INITIAL_FORM });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [refNumber, setRefNumber] = useState("");
  const [uploads, setUploads] = useState<Record<string, UploadedDoc>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const formRef = useRef<HTMLDivElement>(null);

  const [ref] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRef = params.get("ref") || "";

    // If ref is in URL, save it to a 30-day cookie
    if (urlRef) {
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      document.cookie = `fs_ref=${encodeURIComponent(urlRef)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
      return urlRef;
    }

    // Otherwise, check for existing cookie
    const cookieMatch = document.cookie.match(/(?:^|;\s*)fs_ref=([^;]*)/);
    return cookieMatch ? decodeURIComponent(cookieMatch[1]) : "";
  });

  const submitMutation = trpc.submission.submit.useMutation({
    onSuccess: (data) => {
      setRefNumber(data.referenceNumber);
      setSubmitted(true);
    },
    // Never retry form submissions — duplicates are enforced server-side via UNIQUE index
    retry: false,
  });

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const updateScreening = (key: keyof ScreeningQuestions, value: string) => {
    setForm((prev) => ({
      ...prev,
      screeningQuestions: { ...prev.screeningQuestions, [key]: value },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`sq.${key}`];
      return next;
    });
  };

  useEffect(() => {
    const count = form.additionalMembersCount ? parseInt(form.additionalMembersCount) || 0 : 0;
    setForm((prev) => {
      const current = [...prev.householdMembers];
      while (current.length < count) current.push({ name: "", dateOfBirth: "", medicaidId: "", relationship: "" });
      return { ...prev, householdMembers: current.slice(0, count) };
    });
  }, [form.additionalMembersCount]);

  const scrollToTop = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goNext = () => {
    let errs: FormErrors = {};
    if (step === 1) errs = validateStep1(form);
    else if (step === 2) errs = validateStep2(form, uploads);
    else if (step === 3) errs = validateStep3(form);
    else if (step === 4) errs = validateStep4(form);

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      scrollToTop();
      return;
    }

    if (step === 4) {
      handleSubmit();
    } else {
      setStep((s) => s + 1);
      scrollToTop();
    }
  };

  const goBack = () => {
    if (step > 1) {
      setStep((s) => s - 1);
      scrollToTop();
    }
  };

  const handleSubmit = () => {
    // Store both url and key so admin can regenerate fresh pre-signed URLs later
    const uploadedDocuments: Record<string, { url: string; key: string }> = {};
    for (const [k, doc] of Object.entries(uploads)) {
      uploadedDocuments[k] = { url: doc.url, key: doc.key || "" };
    }

    // Build conditionDetails: { [conditionKey]: { clientName, docUrl, docKey } }
    const conditionDetails: Record<string, { clientName: string; docUrl: string; docKey?: string }> = {};
    const allConditions = [...MEDICAL_CONDITION_CATEGORIES, "Other"];
    for (const condition of allConditions) {
      if (!form.healthCategories.includes(condition)) continue;
      const clientName = condition === "Other" ? form.otherConditionDescription : (form.conditionClientNames[condition] || "");
      const docUrl = uploads[`conditionDoc_${condition}`]?.url || "";
      const docKey = uploads[`conditionDoc_${condition}`]?.key || "";
      if (clientName || docUrl) {
        conditionDetails[condition] = { clientName, docUrl, ...(docKey ? { docKey } : {}) };
      }
    }

    // Auto-populate hasWic/hasSnap from screening answers (UI fields were removed as duplicates)
    const hasWic = form.hasWic || form.screeningQuestions.receivesWic || "No";
    const hasSnap = form.hasSnap || form.screeningQuestions.receivesSnap || "No";

    submitMutation.mutate({
      ...form,
      hasWic,
      hasSnap,
      ref: ref || undefined,
      uploadedDocuments: Object.keys(uploadedDocuments).length > 0 ? uploadedDocuments : undefined,
      conditionDetails: Object.keys(conditionDetails).length > 0 ? conditionDetails : undefined,
    } as any);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (!showForm) {
    return <LandingPage onStart={() => setShowForm(true)} />;
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-lg w-full text-center"
        >
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-green-800 font-serif mb-4">Application Submitted!</h2>
          <Card className="border-green-200 bg-green-50 mb-6">
            <CardContent className="p-6">
              <p className="text-sm text-stone-600 mb-2">Your Reference Number</p>
              <p className="text-3xl font-bold text-green-800 tracking-widest">{refNumber}</p>
            </CardContent>
          </Card>
          <div className="space-y-3 text-left bg-white rounded-xl border border-stone-200 p-6 mb-6">
            <h3 className="font-bold text-stone-800">What Happens Next?</h3>
            <div className="space-y-2 text-sm text-stone-600">
              <p>1. A confirmation email has been sent to your email address.</p>
              <p>2. Our Social Care Navigator will review your application and follow up in a few business days.</p>
              <p>3. We will contact you to schedule a follow-up conversation.</p>
              <p>4. Once approved, you will begin receiving your food benefits.</p>
            </div>
          </div>
          <div className="text-sm text-stone-500 mb-6">
            <p>Questions? Call us at <a href="tel:7183074664" className="text-green-700 underline">(718) 307-4664</a> or email <a href="mailto:info@freshselectmeals.com" className="text-green-700 underline">info@freshselectmeals.com</a></p>
          </div>
          <Button
            onClick={() => {
              setShowForm(false);
              setSubmitted(false);
              setStep(1);
              setForm({ ...INITIAL_FORM });
              setUploads({});
              setErrors({});
            }}
            variant="outline"
            className="border-green-600 text-green-700"
          >
            Return to Home
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
      {/* Form Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-700 rounded-lg flex items-center justify-center">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-green-800 font-serif">FreshSelect Meals</span>
          </div>
          <button
            onClick={() => setShowForm(false)}
            className="text-sm text-stone-500 hover:text-stone-700"
          >
            Back to Home
          </button>
        </div>
      </header>

      <div ref={formRef} className="max-w-3xl mx-auto px-4 py-8">
        <ProgressBar step={step} totalSteps={4} />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* ─── STEP 1: Personal Info ─────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-8">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Users className="w-7 h-7 text-green-700" />
                  </div>
                  <h2 className="text-2xl font-bold text-green-800 font-serif">Primary Member Information</h2>
                  <p className="text-stone-500 text-sm mt-1">Please provide your personal details and contact information.</p>
                </div>

                {Object.keys(errors).length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-700">Please fix the following errors:</p>
                      <ul className="text-sm text-red-600 mt-1 list-disc list-inside">
                        {Object.values(errors).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Personal Info */}
                <Card className="border-stone-200">
                  <CardContent className="p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-stone-700">First Name *</Label>
                        <Input
                          value={form.firstName}
                          onChange={(e) => update("firstName", e.target.value)}
                          className={errors.firstName ? "border-red-400" : ""}
                          placeholder="First Name"
                        />
                        {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
                      </div>
                      <div>
                        <Label className="text-stone-700">Last Name *</Label>
                        <Input
                          value={form.lastName}
                          onChange={(e) => update("lastName", e.target.value)}
                          className={errors.lastName ? "border-red-400" : ""}
                          placeholder="Last Name"
                        />
                        {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-stone-700">Date of Birth *</Label>
                        <DobPicker
                          value={form.dateOfBirth}
                          onChange={(v) => update("dateOfBirth", v)}
                          error={!!errors.dateOfBirth}
                        />
                        {errors.dateOfBirth && <p className="text-red-500 text-xs mt-1">{errors.dateOfBirth}</p>}
                      </div>
                      <div>
                        <Label className="text-stone-700">Medicaid ID (CIN) *</Label>
                        <Input
                          value={form.medicaidId}
                          onChange={(e) => update("medicaidId", e.target.value.toUpperCase())}
                          className={errors.medicaidId ? "border-red-400" : ""}
                          placeholder="AB12345C"
                          maxLength={8}
                        />
                        {errors.medicaidId && <p className="text-red-500 text-xs mt-1">{errors.medicaidId}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Contact */}
                <Card className="border-stone-200">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-bold text-stone-800 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-green-600" /> Contact Information
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-stone-700">Cell Phone *</Label>
                        <Input
                          value={form.cellPhone}
                          onChange={(e) => update("cellPhone", e.target.value)}
                          className={errors.cellPhone ? "border-red-400" : ""}
                          placeholder="(718) 555-0123"
                        />
                        {errors.cellPhone && <p className="text-red-500 text-xs mt-1">{errors.cellPhone}</p>}
                      </div>
                      <div>
                        <Label className="text-stone-700">Home Phone</Label>
                        <Input
                          value={form.homePhone}
                          onChange={(e) => update("homePhone", e.target.value)}
                          placeholder="(718) 555-0456"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-stone-700">Email Address *</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                        className={errors.email ? "border-red-400" : ""}
                        placeholder="your@email.com"
                      />
                      {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                    </div>
                  </CardContent>
                </Card>

                {/* Address */}
                <Card className="border-stone-200">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-bold text-stone-800 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-green-600" /> Address
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <Label className="text-stone-700">Street Address *</Label>
                        <Input
                          value={form.streetAddress}
                          onChange={(e) => update("streetAddress", e.target.value)}
                          className={errors.streetAddress ? "border-red-400" : ""}
                          placeholder="123 Main Street"
                        />
                        {errors.streetAddress && <p className="text-red-500 text-xs mt-1">{errors.streetAddress}</p>}
                      </div>
                      <div>
                        <Label className="text-stone-700">Apt/Unit</Label>
                        <Input
                          value={form.aptUnit}
                          onChange={(e) => update("aptUnit", e.target.value)}
                          placeholder="Apt 2B"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-stone-700">City *</Label>
                        <Input
                          value={form.city}
                          onChange={(e) => update("city", e.target.value)}
                          className={errors.city ? "border-red-400" : ""}
                        />
                      </div>
                      <div>
                        <Label className="text-stone-700">State *</Label>
                        <Input
                          value={form.state}
                          onChange={(e) => update("state", e.target.value)}
                          className={errors.state ? "border-red-400" : ""}
                        />
                      </div>
                      <div>
                        <Label className="text-stone-700">Zipcode *</Label>
                        <Input
                          value={form.zipcode}
                          onChange={(e) => update("zipcode", e.target.value)}
                          className={errors.zipcode ? "border-red-400" : ""}
                          placeholder="11219"
                        />
                        {errors.zipcode && <p className="text-red-500 text-xs mt-1">{errors.zipcode}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>


              </div>
            )}

            {/* ─── STEP 2: Screening & Health ────────────────────────── */}
            {step === 2 && (
              <div className="space-y-8">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <ClipboardList className="w-7 h-7 text-green-700" />
                  </div>
                  <h2 className="text-2xl font-bold text-green-800 font-serif">SCN Screening & Health</h2>
                  <p className="text-stone-500 text-sm mt-1">Answer the screening questions and provide health information.</p>
                </div>

                {Object.keys(errors).length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">Please answer all required questions before continuing.</p>
                  </div>
                )}

                {/* SCN Screening Questions */}
                <Card className="border-stone-200">
                  <CardContent className="p-6 space-y-5">
                    <h3 className="font-bold text-stone-800 text-lg">SCN Screening Questionnaire</h3>

                    {/* Q1 - Living Situation */}
                    <div>
                      <Label className="text-stone-700">1. Current living situation *</Label>
                      <Select
                        value={form.screeningQuestions.livingSituation}
                        onValueChange={(v) => updateScreening("livingSituation", v)}
                      >
                        <SelectTrigger className={errors["sq.livingSituation"] ? "border-red-400" : ""}>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {["Renting", "Own Home", "Shelter", "Homeless", "Living with Family/Friends", "Other"].map((v) => (
                            <SelectItem key={v} value={v}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors["sq.livingSituation"] && <p className="text-red-500 text-xs mt-1">{errors["sq.livingSituation"]}</p>}
                    </div>

                    {/* Q2-Q4 Yes/No */}
                    {[
                      { key: "utilityShutoff" as const, label: "2. Utility shutoff threat (past 12 months) *" },
                      { key: "receivesSnap" as const, label: "3. Receives SNAP (Food Stamps) *" },
                      { key: "receivesWic" as const, label: "4. Receives WIC *" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <Label className="text-stone-700">{label}</Label>
                        <YesNoSelect
                          value={form.screeningQuestions[key]}
                          onChange={(v) => updateScreening(key, v)}
                          error={errors[`sq.${key}`]}
                        />
                      </div>
                    ))}

                    {/* Q5 - Enrolled in Health Home */}
                    <div>
                      <Label className="text-stone-700">5. Enrolled in Health Home *</Label>
                      <YesNoSelect
                        value={form.screeningQuestions.enrolledHealthHome}
                        onChange={(v) => updateScreening("enrolledHealthHome", v)}
                        error={errors["sq.enrolledHealthHome"]}
                      />
                    </div>

                    {/* Q6 - Household Members */}
                    <div>
                      <Label className="text-stone-700">6. Number of household members *</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.screeningQuestions.householdMembersCount}
                        onChange={(e) => updateScreening("householdMembersCount", e.target.value)}
                        className={`mt-1 ${errors["sq.householdMembersCount"] ? "border-red-400" : ""}`}
                        placeholder="e.g. 3"
                      />
                      {errors["sq.householdMembersCount"] && <p className="text-red-500 text-xs mt-1">{errors["sq.householdMembersCount"]}</p>}
                    </div>

                    {/* Q7 - Household Members with Medicaid */}
                    <div>
                      <Label className="text-stone-700">7. Household members with Medicaid *</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.screeningQuestions.householdMembersWithMedicaid}
                        onChange={(e) => updateScreening("householdMembersWithMedicaid", e.target.value)}
                        className={`mt-1 ${errors["sq.householdMembersWithMedicaid"] ? "border-red-400" : ""}`}
                        placeholder="e.g. 2"
                      />
                      {errors["sq.householdMembersWithMedicaid"] && <p className="text-red-500 text-xs mt-1">{errors["sq.householdMembersWithMedicaid"]}</p>}
                    </div>

                    {/* Q8-Q9 Yes/No */}
                    {[
                      { key: "medicationsRequireRefrigeration" as const, label: "8. Medications require refrigeration *" },
                      { key: "breastmilkRefrigeration" as const, label: "9. Breastmilk refrigeration needed *" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <Label className="text-stone-700">{label}</Label>
                        <YesNoSelect
                          value={form.screeningQuestions[key]}
                          onChange={(v) => updateScreening(key, v)}
                          error={errors[`sq.${key}`]}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Health Categories */}
                <Card className="border-stone-200">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-bold text-stone-800 flex items-center gap-2">
                      <Heart className="w-4 h-4 text-green-600" /> Health Categories
                    </h3>
                    <p className="text-sm text-stone-500">Select at least one that applies to you. *</p>
                    {errors.healthCategories && <p className="text-red-500 text-xs">{errors.healthCategories}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {HEALTH_CATEGORIES.map((cat) => (
                        <label
                          key={cat}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            form.healthCategories.includes(cat)
                              ? "border-green-400 bg-green-50"
                              : "border-stone-200 hover:border-green-300"
                          }`}
                        >
                          <Checkbox
                            checked={form.healthCategories.includes(cat)}
                            onCheckedChange={(checked) => {
                              update(
                                "healthCategories",
                                checked
                                  ? [...form.healthCategories, cat]
                                  : form.healthCategories.filter((c) => c !== cat)
                              );
                            }}
                          />
                          <span className="text-sm text-stone-700">{cat}</span>
                        </label>
                      ))}
                    </div>

                    {/* Medical condition sub-sections: client name + document upload */}
                    {MEDICAL_CONDITION_CATEGORIES.filter((c) => form.healthCategories.includes(c)).map((condition) => (
                      <div key={condition} className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3 space-y-3">
                        <h4 className="font-semibold text-stone-700 flex items-center gap-2">
                          <span className="text-blue-600">♥</span> {condition} — Details
                        </h4>
                        <div>
                          <Label className="text-stone-700">Client name for this condition *</Label>
                          <Input
                            value={form.conditionClientNames[condition] || ""}
                            onChange={(e) => update("conditionClientNames", { ...form.conditionClientNames, [condition]: e.target.value })}
                            className={errors[`conditionName_${condition}`] ? "border-red-400 mt-1" : "mt-1"}
                            placeholder="Full name of the person with this condition"
                          />
                          {errors[`conditionName_${condition}`] && (
                            <p className="text-red-500 text-xs mt-1">{errors[`conditionName_${condition}`]}</p>
                          )}
                        </div>
                        <FileUploadField
                          label={`Supporting document for ${condition} (preferred)`}
                          category={`conditionDoc_${condition}`}
                          uploads={uploads}
                          setUploads={setUploads}
                          uploading={uploading}
                          setUploading={setUploading}
                        />
                        {errors[`conditionDoc_${condition}`] && (
                          <p className="text-red-500 text-xs">{errors[`conditionDoc_${condition}`]}</p>
                        )}
                      </div>
                    ))}

                    {/* Other condition: description + document */}
                    {form.healthCategories.includes("Other") && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3 space-y-3">
                        <h4 className="font-semibold text-stone-700 flex items-center gap-2">
                          <span className="text-blue-600">♥</span> Other Condition — Details
                        </h4>
                        <div>
                          <Label className="text-stone-700">Please describe the condition *</Label>
                          <Input
                            value={form.otherConditionDescription}
                            onChange={(e) => update("otherConditionDescription", e.target.value)}
                            className={errors.otherConditionDescription ? "border-red-400 mt-1" : "mt-1"}
                            placeholder="Describe the health condition"
                          />
                          {errors.otherConditionDescription && (
                            <p className="text-red-500 text-xs mt-1">{errors.otherConditionDescription}</p>
                          )}
                        </div>
                        <FileUploadField
                          label="Supporting document for Other condition (preferred)"
                          category="conditionDoc_Other"
                          uploads={uploads}
                          setUploads={setUploads}
                          uploading={uploading}
                          setUploading={setUploading}
                        />
                        {errors["conditionDoc_Other"] && (
                          <p className="text-red-500 text-xs">{errors["conditionDoc_Other"]}</p>
                        )}
                      </div>
                    )}

                    {/* Conditional: Pregnant -> Due Date */}
                    {form.healthCategories.includes("Pregnant") && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-3">
                        <Label className="text-stone-700 flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-amber-600" /> Due Date *
                        </Label>
                        <Input
                          type="date"
                          value={form.dueDate}
                          onChange={(e) => update("dueDate", e.target.value)}
                          className={errors.dueDate ? "border-red-400 mt-2" : "mt-2"}
                        />
                        {errors.dueDate && <p className="text-red-500 text-xs mt-1">{errors.dueDate}</p>}
                      </div>
                    )}

                    {/* Conditional: Miscarriage -> Date */}
                    {form.healthCategories.includes("Had a Miscarriage") && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-3">
                        <Label className="text-stone-700 flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-amber-600" /> Date of Miscarriage *
                        </Label>
                        <Input
                          type="date"
                          value={form.miscarriageDate}
                          onChange={(e) => update("miscarriageDate", e.target.value)}
                          className={errors.miscarriageDate ? "border-red-400 mt-2" : "mt-2"}
                        />
                        {errors.miscarriageDate && <p className="text-red-500 text-xs mt-1">{errors.miscarriageDate}</p>}
                      </div>
                    )}

                    {/* Conditional: Postpartum -> Infant Info */}
                    {form.healthCategories.includes("Postpartum (Within the last 12 months)") && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3 space-y-3">
                        <h4 className="font-semibold text-stone-700 flex items-center gap-2">
                          <Baby className="w-4 h-4 text-blue-600" /> Infant Information
                        </h4>
                        <div>
                          <Label className="text-stone-700">Infant Name *</Label>
                          <Input
                            value={form.infantName}
                            onChange={(e) => update("infantName", e.target.value)}
                            className={errors.infantName ? "border-red-400" : ""}
                            placeholder="Baby's full name"
                          />
                          {errors.infantName && <p className="text-red-500 text-xs mt-1">{errors.infantName}</p>}
                        </div>
                        <div>
                          <Label className="text-stone-700">Infant Date of Birth *</Label>
                          <Input
                            type="date"
                            value={form.infantDateOfBirth}
                            onChange={(e) => update("infantDateOfBirth", e.target.value)}
                            className={errors.infantDateOfBirth ? "border-red-400" : ""}
                          />
                          {errors.infantDateOfBirth && <p className="text-red-500 text-xs mt-1">{errors.infantDateOfBirth}</p>}
                        </div>
                        <div>
                          <Label className="text-stone-700">Infant Medicaid ID (CIN) *</Label>
                          <Input
                            value={form.infantMedicaidId}
                            onChange={(e) => update("infantMedicaidId", e.target.value.toUpperCase())}
                            className={errors.infantMedicaidId ? "border-red-400" : ""}
                            placeholder="AB12345C"
                            maxLength={8}
                          />
                          {errors.infantMedicaidId && <p className="text-red-500 text-xs mt-1">{errors.infantMedicaidId}</p>}
                        </div>

                        {/* Child document uploads */}
                        <FileUploadField
                          label="Child's Medicaid Card *"
                          category="childMedicaidCard_0"
                          uploads={uploads}
                          setUploads={setUploads}
                          uploading={uploading}
                          setUploading={setUploading}
                        />
                        <FileUploadField
                          label="Child's Birth Certificate *"
                          category="childBirthCertificate_0"
                          uploads={uploads}
                          setUploads={setUploads}
                          uploading={uploading}
                          setUploading={setUploading}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Benefits & Employment */}
                <Card className="border-stone-200">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-bold text-stone-800">Benefits & Employment</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { key: "employed" as const, label: "Employed *" },
                        { key: "spouseEmployed" as const, label: "Spouse Employed *" },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <Label className="text-stone-700">{label}</Label>
                          <YesNoSelect
                            value={form[key]}
                            onChange={(v) => update(key, v)}
                            error={errors[key]}
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <Label className="text-stone-700">New application or transfer from different agency *</Label>
                      <Select value={form.newApplicant} onValueChange={(v) => update("newApplicant", v)}>
                        <SelectTrigger className={errors.newApplicant ? "border-red-400" : ""}>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New Application</SelectItem>
                          <SelectItem value="Transfer">Transfer from Different Agency</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.newApplicant && <p className="text-red-500 text-xs mt-1">{errors.newApplicant}</p>}
                    </div>
                    {form.newApplicant === "Transfer" && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-3">
                        <Label className="text-stone-700">Agency Name *</Label>
                        <Input
                          value={form.transferAgencyName}
                          onChange={(e) => update("transferAgencyName", e.target.value)}
                          className={errors.transferAgencyName ? "border-red-400 mt-2" : "mt-2"}
                          placeholder="Enter the name of the agency you are transferring from"
                        />
                        {errors.transferAgencyName && <p className="text-red-500 text-xs mt-1">{errors.transferAgencyName}</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Food Allergies / Dietary Restrictions */}
                <Card className="border-stone-200">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-bold text-stone-800">Food Allergies / Dietary Restrictions</h3>
                    <div>
                      <Label className="text-stone-700">Food Allergies</Label>
                      <Select value={form.foodAllergies} onValueChange={(v) => update("foodAllergies", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="No">No</SelectItem>
                          <SelectItem value="Yes">Yes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.foodAllergies === "Yes" && (
                      <div>
                        <Label className="text-stone-700">Please specify allergies</Label>
                        <Textarea
                          value={form.foodAllergiesDetails}
                          onChange={(e) => update("foodAllergiesDetails", e.target.value)}
                          placeholder="List your food allergies..."
                          rows={3}
                        />
                      </div>
                    )}
                    <div>
                      <Label className="text-stone-700">Dietary Restrictions</Label>
                      <Select value={form.dietaryRestrictions} onValueChange={(v) => update("dietaryRestrictions", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {["None", "Kosher", "Halal", "Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free", "Other"].map((v) => (
                            <SelectItem key={v} value={v}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Household Members */}
                <Card className="border-stone-200">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-bold text-stone-800 flex items-center gap-2">
                      <Users className="w-4 h-4 text-green-600" /> Household Members *
                    </h3>
                    <p className="text-sm text-stone-500">Select the number of household members in your household.</p>
                    {errors.householdMembers && <p className="text-red-500 text-xs">{errors.householdMembers}</p>}
                    <div>
                      <Label className="text-stone-700">Number of household members *</Label>
                      <Select
                        value={form.additionalMembersCount}
                        onValueChange={(v) => update("additionalMembersCount", v)}
                      >
                        <SelectTrigger className={errors.householdMembers ? "border-red-400" : ""}>
                          <SelectValue placeholder="Please select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">None — I live alone</SelectItem>
                          {Array.from({ length: 9 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>
                              {`${i + 1} member${i + 1 > 1 ? "s" : ""}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {form.householdMembers.map((member, idx) => (
                      <div key={idx} className="bg-stone-50 border border-stone-200 rounded-lg p-4 space-y-3">
                        <h4 className="font-semibold text-stone-700">Member {idx + 1}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                          <div>
                            <Label className="text-stone-600 text-xs">Relationship *</Label>
                            <Select
                              value={member.relationship}
                              onValueChange={(v) => {
                                const members = [...form.householdMembers];
                                members[idx] = { ...members[idx], relationship: v };
                                update("householdMembers", members);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select relationship..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Child">Child</SelectItem>
                                <SelectItem value="Husband">Husband</SelectItem>
                                <SelectItem value="Wife">Wife</SelectItem>
                                <SelectItem value="Mother">Mother</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <Label className="text-stone-600 text-xs">Full Name *</Label>
                            <Input
                              value={member.name}
                              onChange={(e) => {
                                const members = [...form.householdMembers];
                                members[idx] = { ...members[idx], name: e.target.value };
                                update("householdMembers", members);
                              }}
                              placeholder="Full Name"
                              className={!member.name.trim() && errors.householdMembers ? "border-red-400" : ""}
                            />
                            {!member.name.trim() && errors.householdMembers && (
                              <p className="text-red-500 text-xs mt-0.5">Name is required</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-stone-600 text-xs">Date of Birth *</Label>
                            <DobPicker
                              value={member.dateOfBirth}
                              onChange={(v) => {
                                const members = [...form.householdMembers];
                                members[idx] = { ...members[idx], dateOfBirth: v };
                                update("householdMembers", members);
                              }}
                              error={!member.dateOfBirth && !!errors.householdMembers}
                              size="sm"
                            />
                            {!member.dateOfBirth && errors.householdMembers && (
                              <p className="text-red-500 text-xs mt-0.5">Date of birth is required</p>
                            )}
                          </div>
                          <div>
                            <Label className="text-stone-600 text-xs">Medicaid ID *</Label>
                            <Input
                              value={member.medicaidId}
                              onChange={(e) => {
                                const members = [...form.householdMembers];
                                members[idx] = { ...members[idx], medicaidId: e.target.value.toUpperCase() };
                                update("householdMembers", members);
                              }}
                              placeholder="AB12345C"
                              maxLength={8}
                              className={!member.medicaidId.trim() && errors.householdMembers ? "border-red-400" : ""}
                            />
                            {!member.medicaidId.trim() && errors.householdMembers && (
                              <p className="text-red-500 text-xs mt-0.5">Medicaid ID is required</p>
                            )}
                          </div>
                        </div>

                        {/* Per-member document uploads */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                          <FileUploadField
                            label={`Member ${idx + 1} Medicaid Card`}
                            category={`memberMedicaidCard_${idx}`}
                            uploads={uploads}
                            setUploads={setUploads}
                            uploading={uploading}
                            setUploading={setUploading}
                          />
                          <FileUploadField
                            label={`Member ${idx + 1} Birth Certificate`}
                            category={`memberBirthCertificate_${idx}`}
                            uploads={uploads}
                            setUploads={setUploads}
                            uploading={uploading}
                            setUploading={setUploading}
                          />
                          {(member.relationship === "Husband" || member.relationship === "Wife") && (
                            <FileUploadField
                              label="Marriage License"
                              category={`memberMarriageLicense_${idx}`}
                              uploads={uploads}
                              setUploads={setUploads}
                              uploading={uploading}
                              setUploading={setUploading}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ─── STEP 3: Meals & Preferences ───────────────────────── */}
            {step === 3 && (
              <div className="space-y-8">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <UtensilsCrossed className="w-7 h-7 text-green-700" />
                  </div>
                  <h2 className="text-2xl font-bold text-green-800 font-serif">Meal Preferences</h2>
                  <p className="text-stone-500 text-sm mt-1">Tell us about your meal needs and kitchen setup.</p>
                </div>

                {Object.keys(errors).length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">Please complete all required fields.</p>
                  </div>
                )}

                {/* Meal Focus */}
                <Card className="border-stone-200">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-bold text-stone-800">Meal Focus *</h3>
                    <p className="text-sm text-stone-500">Select the meals you need help with.</p>
                    {errors.mealFocus && <p className="text-red-500 text-xs">{errors.mealFocus}</p>}
                    <div className="grid grid-cols-2 gap-3">
                      {["Breakfast", "Lunch", "Dinner", "Snacks"].map((meal) => (
                        <label
                          key={meal}
                          className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                            form.mealFocus.includes(meal)
                              ? "border-green-400 bg-green-50"
                              : "border-stone-200 hover:border-green-300"
                          }`}
                        >
                          <Checkbox
                            checked={form.mealFocus.includes(meal)}
                            onCheckedChange={(checked) => {
                              update(
                                "mealFocus",
                                checked
                                  ? [...form.mealFocus, meal]
                                  : form.mealFocus.filter((m) => m !== meal)
                              );
                            }}
                          />
                          <span className="text-sm font-medium text-stone-700">{meal}</span>
                        </label>
                      ))}
                    </div>

                    {form.mealFocus.includes("Breakfast") && (
                      <div>
                        <Label className="text-stone-700">Preferred Breakfast Items</Label>
                        <Textarea
                          value={form.breakfastItems}
                          onChange={(e) => update("breakfastItems", e.target.value)}
                          placeholder="e.g., eggs, oatmeal, fruit, cereal..."
                          rows={2}
                        />
                      </div>
                    )}
                    {form.mealFocus.includes("Lunch") && (
                      <div>
                        <Label className="text-stone-700">Preferred Lunch Items</Label>
                        <Textarea
                          value={form.lunchItems}
                          onChange={(e) => update("lunchItems", e.target.value)}
                          placeholder="e.g., sandwiches, salads, soup..."
                          rows={2}
                        />
                      </div>
                    )}
                    {form.mealFocus.includes("Dinner") && (
                      <div>
                        <Label className="text-stone-700">Preferred Dinner Items</Label>
                        <Textarea
                          value={form.dinnerItems}
                          onChange={(e) => update("dinnerItems", e.target.value)}
                          placeholder="e.g., chicken, rice, vegetables..."
                          rows={2}
                        />
                      </div>
                    )}
                    {form.mealFocus.includes("Snacks") && (
                      <div>
                        <Label className="text-stone-700">Preferred Snack Items</Label>
                        <Textarea
                          value={form.snackItems}
                          onChange={(e) => update("snackItems", e.target.value)}
                          placeholder="e.g., crackers, fruit, yogurt..."
                          rows={2}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Appliances */}
                <Card className="border-stone-200">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-bold text-stone-800">Household Appliances / Cooking Needs</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-stone-700">Needs Refrigerator *</Label>
                        <YesNoSelect
                          value={form.needsRefrigerator}
                          onChange={(v) => update("needsRefrigerator", v)}
                          error={errors.needsRefrigerator}
                        />
                      </div>
                      <div>
                        <Label className="text-stone-700">Needs Microwave *</Label>
                        <YesNoSelect
                          value={form.needsMicrowave}
                          onChange={(v) => update("needsMicrowave", v)}
                          error={errors.needsMicrowave}
                        />
                      </div>
                      <div>
                        <Label className="text-stone-700">Needs Cooking Utensils *</Label>
                        <YesNoSelect
                          value={form.needsCookingUtensils}
                          onChange={(v) => update("needsCookingUtensils", v)}
                          error={errors.needsCookingUtensils}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Household Attestation & Electronic Signature */}
                <Card className="border-blue-200 bg-blue-50/30">
                  <CardContent className="p-6 space-y-5">
                    {/* Attestation Header */}
                    <div className="flex items-start gap-3">
                      <ClipboardList className="w-6 h-6 text-blue-700 mt-0.5 shrink-0" />
                      <div>
                        <h3 className="font-bold text-stone-800 text-base">Household Attestation</h3>
                        <p className="text-sm text-stone-600 mt-1 leading-relaxed">
                          I, <span className="font-semibold text-stone-800">{form.guardianName || "________________________________"}</span>, (Member/Parent/Legal Guardian), attest that the individuals
                          listed below are members of my household. They live with me at the address above and
                          share common living arrangements and resources (e.g., food, housing, utilities). This
                          information is provided for SCN/HRSN eligibility and service planning.
                        </p>
                      </div>
                    </div>

                    {/* Household Members List */}
                    {form.householdMembers.length > 0 && (
                      <div className="bg-white rounded-lg border border-blue-100 p-4">
                        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Household Members Listed</p>
                        <ul className="space-y-1">
                          {form.householdMembers.map((m, i) => (
                            <li key={i} className="text-sm text-stone-700">
                              {i + 1}. {m.name}{m.dateOfBirth ? ` — DOB: ${m.dateOfBirth}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Acknowledgment */}
                    <div className="border-t border-blue-100 pt-4">
                      <h4 className="font-semibold text-stone-800 mb-1">Acknowledgment</h4>
                      <p className="text-sm text-stone-600 leading-relaxed">
                        I certify the above information is true and accurate. I understand it may be used to
                        determine eligibility for SCN services and that false information may impact services.
                      </p>
                    </div>

                    {/* Guardian Name Field */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-stone-700">
                        Member/Parent/Guardian Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.guardianName}
                        onChange={(e) => update("guardianName", e.target.value)}
                        placeholder="Full legal name"
                        className={`w-full px-3 py-2 rounded-md border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                          errors.guardianName ? "border-red-400" : "border-stone-300"
                        }`}
                      />
                      {errors.guardianName && (
                        <p className="text-red-500 text-xs">{errors.guardianName}</p>
                      )}
                    </div>

                    {/* Electronic Signature */}
                    <SignaturePad
                      label="Electronic Signature *"
                      value={form.signatureDataUrl}
                      onChange={(dataUrl) => update("signatureDataUrl", dataUrl)}
                      error={errors.signatureDataUrl}
                    />
                  </CardContent>
                </Card>

                {/* HIPAA Consent */}
                <Card className="border-amber-200 bg-amber-50/50">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="w-6 h-6 text-amber-600 mt-0.5 shrink-0" />
                      <div className="space-y-3">
                        <h3 className="font-bold text-stone-800">HIPAA Authorization & Privacy</h3>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <Checkbox
                            checked={form.hipaaConsent}
                            onCheckedChange={(checked) => update("hipaaConsent", checked === true)}
                            className="mt-0.5"
                          />
                          <span className="text-sm text-stone-700 leading-relaxed">
                            I authorize FreshSelect Meals to securely process my health and household information to coordinate my SCN food benefits, and I agree to the{" "}
                            <a href="/privacy" target="_blank" className="text-green-700 underline font-medium">
                              Privacy Policy
                            </a>
                            . *
                          </span>
                        </label>
                        {errors.hipaaConsent && (
                          <p className="text-red-500 text-sm">{errors.hipaaConsent}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ─── STEP 4: Neighborhood & Vendor Selection ─────────────────────────── */}
            {step === 4 && (
              <div className="space-y-8">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Store className="w-7 h-7 text-green-700" />
                  </div>
                  <h2 className="text-2xl font-bold text-green-800 font-serif">Choose Your Vendor</h2>
                  <p className="text-stone-500 text-sm mt-1">First select your neighborhood, then pick your preferred vendor.</p>
                </div>

                {(errors.supermarket || errors.neighborhood) && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">{errors.neighborhood || errors.supermarket}</p>
                  </div>
                )}

                {/* Neighborhood Selection */}
                <div>
                  <h3 className="text-lg font-semibold text-stone-700 mb-3">Select Your Neighborhood</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {NEIGHBORHOODS.map((hood) => (
                      <button
                        key={hood.name}
                        type="button"
                        className={`px-4 py-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                          form.neighborhood === hood.name
                            ? "border-green-500 bg-green-50 text-green-800 ring-2 ring-green-200"
                            : "border-stone-200 text-stone-600 hover:border-green-300 hover:bg-green-50/50"
                        }`}
                        onClick={() => {
                          update("neighborhood", hood.name);
                          update("supermarket", "");
                        }}
                      >
                        {hood.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vendor Selection (shown after neighborhood is picked) */}
                {form.neighborhood && (
                  <div>
                    <h3 className="text-lg font-semibold text-stone-700 mb-3">Vendors in {form.neighborhood}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {NEIGHBORHOODS.find((n) => n.name === form.neighborhood)?.vendors.map((store) => (
                        <Card
                          key={store.name}
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            form.supermarket === store.name
                              ? "border-green-500 bg-green-50 ring-2 ring-green-200"
                              : "border-stone-200 hover:border-green-300"
                          }`}
                          onClick={() => update("supermarket", store.name)}
                        >
                          <CardContent className="p-6 text-center">
                            <div className="w-16 h-16 mx-auto mb-3 rounded-lg overflow-hidden bg-white flex items-center justify-center border border-stone-100">
                              <img src={store.logo} alt={store.name} className="w-full h-full object-contain" />
                            </div>
                            <h3 className="font-bold text-stone-800 text-lg">{store.name}</h3>
                            <p className="text-sm text-stone-500 flex items-center justify-center gap-1 mt-2">
                              <MapPin className="w-3 h-3" /> {store.address}
                            </p>
                            {form.supermarket === store.name && (
                              <div className="mt-3">
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-3 py-1 rounded-full">
                                  <CheckCircle2 className="w-3 h-3" /> Selected
                                </span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between mt-8 pb-8 gap-3">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={step === 1}
            className="border-stone-300 text-stone-600 w-full sm:w-auto"
          >
            <ChevronLeft className="w-4 h-4 mr-2" /> Previous
          </Button>

          <span className="text-sm text-stone-500">
            Step {step} of 4
          </span>

          <Button
            onClick={goNext}
            disabled={submitMutation.isPending}
            className="bg-green-700 hover:bg-green-800 text-white w-full sm:w-auto"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...
              </>
            ) : step === 4 ? (
              <>
                Submit Application <CheckCircle2 className="w-4 h-4 ml-2" />
              </>
            ) : (
              <>
                Next Step <ChevronRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>

        {submitMutation.isError && (() => {
          const errMsg = (submitMutation.error as any)?.message || "";
          const isDuplicate = errMsg.startsWith("DUPLICATE:");
          const dupRef = isDuplicate ? errMsg.split(":")[1] : null;
          return isDuplicate ? (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-8">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-amber-800 font-semibold">Application Already Submitted</p>
                  <p className="text-sm text-amber-700 mt-1">
                    A FreshSelect Meals application for this Medicaid ID has already been received.
                    {dupRef && <> Your reference number is <strong>{dupRef}</strong>.</>}
                  </p>
                  <p className="text-xs text-amber-600 mt-2">If you believe this is an error, please call <strong>(718) 307-4664</strong> or email <strong>info@freshselectmeals.com</strong>.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-red-700 font-medium">Something went wrong. Please try again.</p>
                  <p className="text-xs text-red-600 mt-1">If the problem persists, call (718) 307-4664 or email info@freshselectmeals.com.</p>
                </div>
              </div>
              <Button
                type="button"
                className="mt-3 bg-red-600 hover:bg-red-700 text-white text-sm"
                onClick={() => { submitMutation.reset(); handleSubmit(); }}
              >
                Try Again
              </Button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
