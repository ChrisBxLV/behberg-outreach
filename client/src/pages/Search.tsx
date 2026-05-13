import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  Mail,
  MapPin,
  Plus,
  RotateCcw,
  Search as SearchIcon,
  Users,
} from "lucide-react";
import { toast } from "sonner";

const HEADCOUNT_BANDS = ["1-10", "11-50", "51-200", "201-500", "501-1k", "1k-5k", "5k-10k", "10k+"] as const;

const SENIORITY_LEVELS = [
  { value: "c_level", label: "C-level" },
  { value: "head", label: "Head / VP" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager / Lead" },
  { value: "ic", label: "Individual contributor" },
  { value: "unknown", label: "Unknown" },
] as const;

const SOURCE_OPTIONS = [
  { value: "wikidata", label: "Wikidata" },
  { value: "sec_edgar", label: "SEC EDGAR" },
  { value: "uk_ch", label: "UK Companies House" },
  { value: "linkedin_serp", label: "LinkedIn (search)" },
  { value: "website", label: "Company website" },
  { value: "user_import", label: "Imported by you" },
  { value: "unknown", label: "Unknown" },
] as const;

const COMPANY_SORTS = [
  { value: "recent", label: "Recently enriched" },
  { value: "name_asc", label: "Name A → Z" },
  { value: "name_desc", label: "Name Z → A" },
  { value: "headcount_desc", label: "Largest first" },
  { value: "headcount_asc", label: "Smallest first" },
] as const;

const EMPLOYEE_SORTS = [
  { value: "recent", label: "Recently verified" },
  { value: "with_email_first", label: "With email first" },
  { value: "seniority", label: "By seniority" },
  { value: "name_asc", label: "Name A → Z" },
] as const;

const EMAIL_FILTERS = [
  { value: "any", label: "Any email status" },
  { value: "with_email", label: "With work email (MX)" },
  { value: "without_email", label: "Email unknown" },
  { value: "mx_absent", label: "Domain has no MX" },
] as const;

const REGION_GROUPS: Array<{ label: string; countries: Array<{ code: string; label: string }> }> = [
  {
    label: "North America",
    countries: [
      { code: "US", label: "United States" },
      { code: "CA", label: "Canada" },
    ],
  },
  {
    label: "Europe",
    countries: [
      { code: "GB", label: "United Kingdom" },
      { code: "DE", label: "Germany" },
      { code: "FR", label: "France" },
      { code: "IT", label: "Italy" },
      { code: "ES", label: "Spain" },
      { code: "NL", label: "Netherlands" },
      { code: "SE", label: "Sweden" },
      { code: "NO", label: "Norway" },
      { code: "DK", label: "Denmark" },
      { code: "FI", label: "Finland" },
      { code: "PL", label: "Poland" },
      { code: "CH", label: "Switzerland" },
      { code: "AT", label: "Austria" },
      { code: "BE", label: "Belgium" },
      { code: "IE", label: "Ireland" },
      { code: "PT", label: "Portugal" },
    ],
  },
  {
    label: "Middle East",
    countries: [
      { code: "IL", label: "Israel" },
      { code: "AE", label: "UAE" },
      { code: "SA", label: "Saudi Arabia" },
      { code: "QA", label: "Qatar" },
      { code: "TR", label: "Turkey" },
    ],
  },
  {
    label: "Asia",
    countries: [
      { code: "IN", label: "India" },
      { code: "JP", label: "Japan" },
      { code: "SG", label: "Singapore" },
      { code: "KR", label: "South Korea" },
      { code: "HK", label: "Hong Kong" },
      { code: "ID", label: "Indonesia" },
      { code: "VN", label: "Vietnam" },
      { code: "TH", label: "Thailand" },
      { code: "MY", label: "Malaysia" },
      { code: "PH", label: "Philippines" },
    ],
  },
];

type EmailFilter = (typeof EMAIL_FILTERS)[number]["value"];
type CompanySort = (typeof COMPANY_SORTS)[number]["value"];
type EmployeeSort = (typeof EMPLOYEE_SORTS)[number]["value"];
type ProspectSource = (typeof SOURCE_OPTIONS)[number]["value"];
type Seniority = (typeof SENIORITY_LEVELS)[number]["value"];
type Headcount = (typeof HEADCOUNT_BANDS)[number];

type FilterState = {
  q: string;
  countries: string[];
  industryCodes: string[];
  cityContains: string;
  sources: ProspectSource[];
  // Companies
  headcountBands: Headcount[];
  hasDomainOnly: boolean;
  verifiedDomainOnly: boolean;
  hasLinkedinCompanyOnly: boolean;
  hasEmployeesOnly: boolean;
  hasEmailsOnly: boolean;
  excludeMyCompanies: boolean;
  companySort: CompanySort;
  // People
  seniorityLevels: Seniority[];
  titleContains: string;
  emailFilter: EmailFilter;
  hasLinkedinPersonOnly: boolean;
  hasTitleOnly: boolean;
  excludeMyContacts: boolean;
  employeeSort: EmployeeSort;
};

const DEFAULT_FILTERS: FilterState = {
  q: "",
  countries: [],
  industryCodes: [],
  cityContains: "",
  sources: [],
  headcountBands: [],
  hasDomainOnly: false,
  verifiedDomainOnly: false,
  hasLinkedinCompanyOnly: false,
  hasEmployeesOnly: false,
  hasEmailsOnly: false,
  excludeMyCompanies: false,
  companySort: "recent",
  seniorityLevels: [],
  titleContains: "",
  emailFilter: "any",
  hasLinkedinPersonOnly: false,
  hasTitleOnly: false,
  excludeMyContacts: false,
  employeeSort: "recent",
};

export default function SearchPage() {
  return (
    <DashboardLayout>
      <SearchContent />
    </DashboardLayout>
  );
}

function SearchContent() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState<"companies" | "employees">("companies");
  const [expandedCompanyId, setExpandedCompanyId] = useState<number | null>(null);

  const configQuery = trpc.prospectSearch.config.useQuery();
  const industriesQuery = trpc.prospectSearch.industries.useQuery();
  const statsQuery = trpc.prospectSearch.stats.useQuery();

  const serpEnabled = Boolean(configQuery.data?.serpSourcesEnabled);
  const sourceOptions = useMemo(() => {
    return SOURCE_OPTIONS.map(s => {
      if (s.value !== "linkedin_serp") return { ...s, disabled: false };
      return { ...s, disabled: !serpEnabled, label: serpEnabled ? s.label : `${s.label} (disabled)` };
    });
  }, [serpEnabled]);

  const industryOptions = useMemo(() => {
    const rows = industriesQuery.data ?? [];
    const tops = rows.filter(r => !r.parentCode);
    return tops.map(top => ({
      code: top.code,
      label: top.label,
      children: rows.filter(r => r.parentCode === top.code),
    }));
  }, [industriesQuery.data]);

  const activeFilterCount = countActiveFilters(filters, activeTab);
  const isSuperadmin = user?.role === "superadmin";

  return (
    <div className="space-y-4 p-2 md:p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Search</h1>
        <p className="text-sm text-muted-foreground">
          Browse the autonomous prospect database — companies discovered by the background crawler,
          their employees, and best-guess work emails verified by MX records.
          {isSuperadmin ? (
            <>
              {" "}
              LinkedIn/SERP sources are disabled by default unless the server sets{" "}
              <span className="font-mono">PROSPECT_ENABLE_SERP_SOURCES=true</span>.
            </>
          ) : null}
        </p>
      </div>

      <StatsBar stats={statsQuery.data} />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <FiltersPanel
          filters={filters}
          setFilters={setFilters}
          industryOptions={industryOptions}
          activeTab={activeTab}
          activeFilterCount={activeFilterCount}
          sourceOptions={sourceOptions}
        />

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "companies" | "employees")}>
                <TabsList>
                  <TabsTrigger value="companies">
                    <Building2 className="h-4 w-4 mr-2" />
                    Companies
                  </TabsTrigger>
                  <TabsTrigger value="employees">
                    <Users className="h-4 w-4 mr-2" />
                    People
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <SortControls activeTab={activeTab} filters={filters} setFilters={setFilters} />
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === "companies" ? (
              <CompanyResults
                filters={filters}
                expandedCompanyId={expandedCompanyId}
                isSuperadmin={isSuperadmin}
                onToggleCompany={id => setExpandedCompanyId(prev => (prev === id ? null : id))}
              />
            ) : (
              <EmployeeResults filters={filters} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function countActiveFilters(f: FilterState, tab: "companies" | "employees"): number {
  let n = 0;
  if (f.q.trim()) n++;
  if (f.countries.length) n++;
  if (f.industryCodes.length) n++;
  if (f.cityContains.trim()) n++;
  if (f.sources.length) n++;
  if (tab === "companies") {
    if (f.headcountBands.length) n++;
    if (f.hasDomainOnly) n++;
    if (f.verifiedDomainOnly) n++;
    if (f.hasLinkedinCompanyOnly) n++;
    if (f.hasEmployeesOnly) n++;
    if (f.hasEmailsOnly) n++;
    if (f.excludeMyCompanies) n++;
  } else {
    if (f.seniorityLevels.length) n++;
    if (f.titleContains.trim()) n++;
    if (f.emailFilter !== "any") n++;
    if (f.hasLinkedinPersonOnly) n++;
    if (f.hasTitleOnly) n++;
    if (f.excludeMyContacts) n++;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Stats                                                              */
/* ------------------------------------------------------------------ */

function StatsBar({
  stats,
}: {
  stats:
    | {
        totals: { companies: number; employees: number; employeesWithEmail: number };
        byCountry: Array<{ country: string | null; count: number }>;
        byIndustry: Array<{ industryCode: string | null; count: number }>;
      }
    | undefined;
}) {
  const totals = stats?.totals ?? { companies: 0, employees: 0, employeesWithEmail: 0 };
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="Companies" value={totals.companies} />
      <StatCard label="People" value={totals.employees} />
      <StatCard
        label="With work emails"
        value={totals.employeesWithEmail}
        hint={
          totals.employees > 0
            ? `${Math.round((totals.employeesWithEmail / totals.employees) * 100)}% MX-verified`
            : undefined
        }
      />
      <StatCard label="Countries covered" value={(stats?.byCountry ?? []).length} />
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1 tabular-nums">{value.toLocaleString()}</div>
        {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Filters                                                            */
/* ------------------------------------------------------------------ */

function FiltersPanel({
  filters,
  setFilters,
  industryOptions,
  activeTab,
  activeFilterCount,
  sourceOptions,
}: {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  industryOptions: Array<{ code: string; label: string; children: Array<{ code: string; label: string }> }>;
  activeTab: "companies" | "employees";
  activeFilterCount: number;
  sourceOptions: ReadonlyArray<{ value: ProspectSource; label: string; disabled?: boolean }>;
}) {
  return (
    <Card className="self-start lg:sticky lg:top-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 ? (
              <Badge variant="secondary" className="text-[10px]">
                {activeFilterCount}
              </Badge>
            ) : null}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            disabled={activeFilterCount === 0}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        </div>
        <CardDescription className="text-xs">
          The crawler grows the catalogue daily. Combine filters to narrow results.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Quick search</Label>
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={filters.q}
              placeholder={activeTab === "companies" ? "Company name…" : "Person or title…"}
              onChange={e => setFilters(prev => ({ ...prev, q: e.target.value }))}
              className="pl-8"
            />
          </div>
        </div>

        <Accordion type="multiple" defaultValue={["location", "industry", "boolean"]} className="w-full">
          <AccordionItem value="location" className="border-b">
            <AccordionTrigger className="py-2 text-xs font-medium">
              <span className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" />
                Location
                {filters.countries.length ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {filters.countries.length}
                  </Badge>
                ) : null}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3 space-y-3">
              <CountryMultiSelect
                value={filters.countries}
                onChange={countries => setFilters(prev => ({ ...prev, countries }))}
              />
              <div className="space-y-1.5">
                <Label className="text-xs">City contains</Label>
                <Input
                  value={filters.cityContains}
                  onChange={e => setFilters(prev => ({ ...prev, cityContains: e.target.value }))}
                  placeholder="e.g. London"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="industry" className="border-b">
            <AccordionTrigger className="py-2 text-xs font-medium">
              <span className="flex items-center gap-2">
                Industry
                {filters.industryCodes.length ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {filters.industryCodes.length}
                  </Badge>
                ) : null}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3 space-y-2">
              <IndustryMultiSelect
                options={industryOptions}
                value={filters.industryCodes}
                onChange={industryCodes => setFilters(prev => ({ ...prev, industryCodes }))}
              />
            </AccordionContent>
          </AccordionItem>

          {activeTab === "companies" ? (
            <AccordionItem value="size" className="border-b">
              <AccordionTrigger className="py-2 text-xs font-medium">
                <span className="flex items-center gap-2">
                  Headcount
                  {filters.headcountBands.length ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {filters.headcountBands.length}
                    </Badge>
                  ) : null}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3 space-y-1.5">
                {HEADCOUNT_BANDS.map(band => (
                  <CheckboxRow
                    key={band}
                    label={`${band} employees`}
                    checked={filters.headcountBands.includes(band)}
                    onCheckedChange={checked =>
                      setFilters(prev => ({
                        ...prev,
                        headcountBands: checked
                          ? Array.from(new Set([...prev.headcountBands, band]))
                          : prev.headcountBands.filter(b => b !== band),
                      }))
                    }
                  />
                ))}
              </AccordionContent>
            </AccordionItem>
          ) : (
            <>
              <AccordionItem value="seniority" className="border-b">
                <AccordionTrigger className="py-2 text-xs font-medium">
                  <span className="flex items-center gap-2">
                    Seniority
                    {filters.seniorityLevels.length ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {filters.seniorityLevels.length}
                      </Badge>
                    ) : null}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3 space-y-1.5">
                  {SENIORITY_LEVELS.map(s => (
                    <CheckboxRow
                      key={s.value}
                      label={s.label}
                      checked={filters.seniorityLevels.includes(s.value)}
                      onCheckedChange={checked =>
                        setFilters(prev => ({
                          ...prev,
                          seniorityLevels: checked
                            ? Array.from(new Set([...prev.seniorityLevels, s.value]))
                            : prev.seniorityLevels.filter(v => v !== s.value),
                        }))
                      }
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="title" className="border-b">
                <AccordionTrigger className="py-2 text-xs font-medium">Title</AccordionTrigger>
                <AccordionContent className="pb-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Title contains</Label>
                    <Input
                      value={filters.titleContains}
                      onChange={e => setFilters(prev => ({ ...prev, titleContains: e.target.value }))}
                      placeholder="e.g. growth, marketing"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email status</Label>
                    <Select
                      value={filters.emailFilter}
                      onValueChange={value => setFilters(prev => ({ ...prev, emailFilter: value as EmailFilter }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMAIL_FILTERS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </>
          )}

          <AccordionItem value="source" className="border-b">
            <AccordionTrigger className="py-2 text-xs font-medium">
              <span className="flex items-center gap-2">
                Source
                {filters.sources.length ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {filters.sources.length}
                  </Badge>
                ) : null}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3 space-y-1.5">
              {sourceOptions.map(s => (
                <CheckboxRow
                  key={s.value}
                  label={s.label}
                  disabled={Boolean(s.disabled) && !filters.sources.includes(s.value)}
                  checked={filters.sources.includes(s.value)}
                  onCheckedChange={checked =>
                    setFilters(prev => ({
                      ...prev,
                      sources: checked
                        ? Array.from(new Set([...prev.sources, s.value]))
                        : prev.sources.filter(v => v !== s.value),
                    }))
                  }
                />
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="boolean" className="border-b-0">
            <AccordionTrigger className="py-2 text-xs font-medium">Quick toggles</AccordionTrigger>
            <AccordionContent className="pb-3 space-y-2">
              {activeTab === "companies" ? (
                <>
                  <SwitchRow
                    label="Has any domain"
                    hint="Hide companies awaiting domain resolution"
                    checked={filters.hasDomainOnly}
                    onCheckedChange={value => setFilters(prev => ({ ...prev, hasDomainOnly: value }))}
                  />
                  <SwitchRow
                    label="Domain verified (MX live)"
                    hint="Only show companies with confirmed live websites"
                    checked={filters.verifiedDomainOnly}
                    onCheckedChange={value => setFilters(prev => ({ ...prev, verifiedDomainOnly: value }))}
                  />
                  <SwitchRow
                    label="Has LinkedIn page"
                    checked={filters.hasLinkedinCompanyOnly}
                    onCheckedChange={value =>
                      setFilters(prev => ({ ...prev, hasLinkedinCompanyOnly: value }))
                    }
                  />
                  <SwitchRow
                    label="Has known employees"
                    checked={filters.hasEmployeesOnly}
                    onCheckedChange={value => setFilters(prev => ({ ...prev, hasEmployeesOnly: value }))}
                  />
                  <SwitchRow
                    label="Has people with emails"
                    checked={filters.hasEmailsOnly}
                    onCheckedChange={value => setFilters(prev => ({ ...prev, hasEmailsOnly: value }))}
                  />
                  <Separator className="my-1" />
                  <SwitchRow
                    label="Hide companies in my CRM"
                    hint="Skip companies that already match your contacts"
                    checked={filters.excludeMyCompanies}
                    onCheckedChange={value => setFilters(prev => ({ ...prev, excludeMyCompanies: value }))}
                  />
                </>
              ) : (
                <>
                  <SwitchRow
                    label="Has LinkedIn profile"
                    checked={filters.hasLinkedinPersonOnly}
                    onCheckedChange={value =>
                      setFilters(prev => ({ ...prev, hasLinkedinPersonOnly: value }))
                    }
                  />
                  <SwitchRow
                    label="Has a job title"
                    checked={filters.hasTitleOnly}
                    onCheckedChange={value => setFilters(prev => ({ ...prev, hasTitleOnly: value }))}
                  />
                  <Separator className="my-1" />
                  <SwitchRow
                    label="Hide people in my CRM"
                    hint="Skip people you've already imported as contacts"
                    checked={filters.excludeMyContacts}
                    onCheckedChange={value => setFilters(prev => ({ ...prev, excludeMyContacts: value }))}
                  />
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function SortControls({
  activeTab,
  filters,
  setFilters,
}: {
  activeTab: "companies" | "employees";
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
}) {
  if (activeTab === "companies") {
    return (
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Sort</Label>
        <Select
          value={filters.companySort}
          onValueChange={value => setFilters(prev => ({ ...prev, companySort: value as CompanySort }))}
        >
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPANY_SORTS.map(s => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">Sort</Label>
      <Select
        value={filters.employeeSort}
        onValueChange={value => setFilters(prev => ({ ...prev, employeeSort: value as EmployeeSort }))}
      >
        <SelectTrigger className="h-8 w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EMPLOYEE_SORTS.map(s => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  // "disabled" means "prevent enabling", not "trap an already-selected filter".
  const effectiveDisabled = Boolean(disabled) && !checked;
  return (
    <label
      className={[
        "flex items-center gap-2 text-xs",
        effectiveDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      ].join(" ")}
    >
      <Checkbox
        checked={checked}
        disabled={effectiveDisabled}
        onCheckedChange={value => {
          if (effectiveDisabled) return;
          onCheckedChange(value === true);
        }}
      />
      <span>{label}</span>
    </label>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer rounded-md border px-3 py-2 hover:bg-accent/40 transition-colors">
      <div className="space-y-0.5">
        <div className="text-xs font-medium leading-none">{label}</div>
        {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function CountryMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <ScrollArea className="h-44 rounded-md border p-2">
      <div className="space-y-2">
        {REGION_GROUPS.map(group => (
          <div key={group.label} className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{group.label}</div>
            {group.countries.map(c => (
              <CheckboxRow
                key={c.code}
                label={c.label}
                checked={value.includes(c.code)}
                onCheckedChange={checked =>
                  onChange(
                    checked
                      ? Array.from(new Set([...value, c.code]))
                      : value.filter(v => v !== c.code),
                  )
                }
              />
            ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function IndustryMultiSelect({
  options,
  value,
  onChange,
}: {
  options: Array<{ code: string; label: string; children: Array<{ code: string; label: string }> }>;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Industries appear once the crawler classifies its first companies.
      </p>
    );
  }
  return (
    <ScrollArea className="h-56 rounded-md border p-2">
      <div className="space-y-2">
        {options.map(top => (
          <div key={top.code} className="space-y-1">
            <CheckboxRow
              label={top.label}
              checked={value.includes(top.code)}
              onCheckedChange={checked =>
                onChange(
                  checked
                    ? Array.from(new Set([...value, top.code]))
                    : value.filter(v => v !== top.code),
                )
              }
            />
            {top.children.length > 0 ? (
              <div className="ml-4 space-y-1">
                {top.children.map(child => (
                  <CheckboxRow
                    key={child.code}
                    label={child.label}
                    checked={value.includes(child.code)}
                    onCheckedChange={checked =>
                      onChange(
                        checked
                          ? Array.from(new Set([...value, child.code]))
                          : value.filter(v => v !== child.code),
                      )
                    }
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

/* ------------------------------------------------------------------ */
/* Companies                                                          */
/* ------------------------------------------------------------------ */

function CompanyResults({
  filters,
  expandedCompanyId,
  isSuperadmin,
  onToggleCompany,
}: {
  filters: FilterState;
  expandedCompanyId: number | null;
  isSuperadmin: boolean;
  onToggleCompany: (id: number) => void;
}) {
  const query = trpc.prospectSearch.companies.useInfiniteQuery(
    {
      q: filters.q || undefined,
      countries: filters.countries.length ? filters.countries : undefined,
      cityContains: filters.cityContains || undefined,
      industryCodes: filters.industryCodes.length ? filters.industryCodes : undefined,
      headcountBands: filters.headcountBands.length ? filters.headcountBands : undefined,
      sources: filters.sources.length ? filters.sources : undefined,
      hasDomainOnly: filters.hasDomainOnly || undefined,
      verifiedDomainOnly: filters.verifiedDomainOnly || undefined,
      hasLinkedinOnly: filters.hasLinkedinCompanyOnly || undefined,
      hasEmployeesOnly: filters.hasEmployeesOnly || undefined,
      hasEmailsOnly: filters.hasEmailsOnly || undefined,
      excludeMyContacts: filters.excludeMyCompanies || undefined,
      sortBy: filters.companySort,
      limit: 25,
    },
    { getNextPageParam: lastPage => lastPage.nextCursor ?? undefined },
  );

  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap(p => p.items),
    [query.data],
  );

  if (query.isLoading) return <EmptyState text="Loading companies…" />;
  if (!items.length) return <EmptyState text="No companies match your filters yet." />;

  return (
    <div className="space-y-2">
      {items.map(company => (
        <div key={company.id} className="border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => onToggleCompany(company.id)}
            className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{company.name}</span>
                  {company.domain ? (
                    <a
                      href={`https://${company.domain}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
                      onClick={e => e.stopPropagation()}
                    >
                      {company.domain}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                  {company.websiteVerified ? (
                    <Badge variant="secondary" className="text-[10px] gap-1 px-1.5">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </Badge>
                  ) : null}
                  {company.inMyContactsCount ? (
                    <Badge className="text-[10px]">
                      {company.inMyContactsCount} in CRM
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {company.industryCode ? (
                    <Badge variant="outline" className="text-[10px]">
                      {company.industryCode}
                    </Badge>
                  ) : null}
                  {company.hqCountry ? (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[company.hqCity, company.hqAdmin1, company.hqCountry].filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                  {company.headcountBand ? (
                    <span className="text-xs text-muted-foreground">{company.headcountBand} employees</span>
                  ) : null}
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {company.source.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
            </div>
            {expandedCompanyId === company.id ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>
          {expandedCompanyId === company.id ? (
            <CompanyEmployees companyId={company.id} isSuperadmin={isSuperadmin} />
          ) : null}
        </div>
      ))}

      {query.hasNextPage ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CompanyEmployees({ companyId, isSuperadmin }: { companyId: number; isSuperadmin: boolean }) {
  const query = trpc.prospectSearch.employeesByCompany.useQuery({ companyId });
  const items = query.data ?? [];
  if (query.isLoading) return <div className="px-4 py-3 text-sm text-muted-foreground">Loading people…</div>;
  if (!items.length) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">
        {isSuperadmin ? (
          <>
            No employees harvested yet. LinkedIn/SERP harvesting is disabled by default; an admin can enable it with{" "}
            <span className="font-mono">PROSPECT_ENABLE_SERP_SOURCES=true</span>.
          </>
        ) : (
          "No employees harvested yet."
        )}
      </div>
    );
  }
  return (
    <div className="border-t bg-muted/30">
      {items.map(emp => (
        <EmployeeRow key={emp.id} employee={emp as any} compact />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* People                                                             */
/* ------------------------------------------------------------------ */

function EmployeeResults({ filters }: { filters: FilterState }) {
  const query = trpc.prospectSearch.employees.useInfiniteQuery(
    {
      q: filters.q || undefined,
      countries: filters.countries.length ? filters.countries : undefined,
      seniorityLevels: filters.seniorityLevels.length ? filters.seniorityLevels : undefined,
      titleContains: filters.titleContains || undefined,
      sources: filters.sources.length ? filters.sources : undefined,
      emailFilter: filters.emailFilter,
      hasLinkedinOnly: filters.hasLinkedinPersonOnly || undefined,
      hasTitleOnly: filters.hasTitleOnly || undefined,
      excludeMyContacts: filters.excludeMyContacts || undefined,
      sortBy: filters.employeeSort,
      limit: 25,
    },
    { getNextPageParam: lastPage => lastPage.nextCursor ?? undefined },
  );
  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap(p => p.items),
    [query.data],
  );

  if (query.isLoading) return <EmptyState text="Loading people…" />;
  if (!items.length) return <EmptyState text="No people match your filters yet." />;

  return (
    <div className="divide-y border rounded-lg">
      {items.map(emp => (
        <EmployeeRow key={emp.id} employee={emp} />
      ))}
      {query.hasNextPage ? (
        <div className="flex justify-center py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function EmployeeRow({
  employee,
  compact,
}: {
  employee: {
    id: number;
    fullName: string;
    title: string | null;
    seniorityLevel: string;
    email: string | null;
    emailStatus: string;
    locationCountry: string | null;
    linkedinUrl: string | null;
    inMyContactsId?: number | null;
    company?: { id: number; name: string; domain: string | null } | null;
  };
  compact?: boolean;
}) {
  const utils = trpc.useUtils();
  const addToContacts = trpc.prospectSearch.addToContacts.useMutation({
    onSuccess: ({ created, merged }) => {
      const detail = created > 0 ? `Added ${created} to your contacts.` : "Already in your contacts.";
      const merge = merged > 0 ? ` Merged ${merged}.` : "";
      toast.success(detail + merge);
      void utils.prospectSearch.invalidate();
    },
    onError: err => toast.error(err.message),
  });
  const inCRM = employee.inMyContactsId != null;

  return (
    <div className={`flex items-center justify-between gap-3 ${compact ? "px-4 py-2" : "p-3"}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{employee.fullName}</span>
          {inCRM ? (
            <Badge className="text-[10px] gap-1 px-1.5">
              <CheckCircle2 className="h-3 w-3" />
              In CRM
            </Badge>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {[employee.title, employee.company?.name].filter(Boolean).join(" — ")}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {employee.linkedinUrl ? (
          <a
            href={employee.linkedinUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            LinkedIn
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        {employee.email ? (
          <a
            href={`mailto:${employee.email}`}
            className="text-xs inline-flex items-center gap-1 text-foreground hover:underline"
          >
            <Mail className="h-3 w-3" />
            {employee.email}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {employee.emailStatus === "mx_absent" ? "No MX" : "Pending"}
          </span>
        )}
        <Badge variant="outline" className="text-[10px]">
          {employee.seniorityLevel}
        </Badge>
        <Button
          size="sm"
          variant={inCRM ? "outline" : "default"}
          className="h-7 text-xs"
          disabled={addToContacts.isPending || inCRM}
          onClick={() => addToContacts.mutate({ employeeIds: [employee.id] })}
        >
          {inCRM ? "Already added" : <><Plus className="h-3 w-3 mr-1" />Add</>}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                        */
/* ------------------------------------------------------------------ */

function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-10 text-sm text-muted-foreground">{text}</div>;
}
