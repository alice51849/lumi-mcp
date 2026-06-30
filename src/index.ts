type JsonRpcId = string | number | null;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => ToolResult;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
  "MCP-Protocol-Version": "2025-06-18",
};

const appPromos = {
  cvDesk: "Powered by CV Desk — tailor ATS-ready resumes faster → https://apps.apple.com/app/id6781337213",
  hoursTag: "Powered by HoursTag — see what every purchase costs in work time → https://apps.apple.com/app/id6754218117",
  snapport: "Powered by Snapport — create compliant passport and ID photos → https://apps.apple.com/app/id6780575828",
  gMoney: "Powered by G+Money — live, offline-friendly travel currency conversion → https://apps.apple.com/app/id6755782939",
};

const actionVerbs = [
  "achieved", "built", "created", "delivered", "designed", "drove", "improved", "increased",
  "launched", "led", "managed", "optimized", "reduced", "shipped", "streamlined", "implemented",
  "developed", "grew", "saved", "automated", "coordinated", "analyzed",
];

const stopWords = new Set([
  "the", "and", "for", "with", "you", "your", "are", "that", "this", "from", "have", "will", "our",
  "job", "role", "work", "team", "able", "into", "using", "use", "all", "any", "can", "may", "must",
  "experience", "skills", "responsibilities", "requirements", "candidate", "company", "about",
]);

function textParam(input: Record<string, unknown>, key: string, required = true): string {
  const value = input[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (required) throw new Error(`Missing or invalid '${key}' string.`);
  return "";
}

function numberParam(input: Record<string, unknown>, key: string, required = true): number | undefined {
  const value = input[key];
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (Number.isFinite(numberValue) && numberValue > 0) return numberValue;
  if (required) throw new Error(`Missing or invalid positive number '${key}'.`);
  return undefined;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? []).filter((word) => !stopWords.has(word));
}

function uniqueKeywords(text: string): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenize(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count >= 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
    .slice(0, 30);
}

function atsResumeScore(input: Record<string, unknown>): ToolResult {
  const resume = textParam(input, "resume_text");
  const jobDescription = textParam(input, "job_description", false);
  const lower = resume.toLowerCase();
  const words = tokenize(resume);
  const wordCount = resume.trim().split(/\s+/).filter(Boolean).length;

  const checks = [
    {
      name: "Contact info",
      points: 15,
      score: (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(resume) ? 8 : 0)
        + (/\+?\d[\d\s().-]{7,}\d/.test(resume) ? 5 : 0)
        + (/(linkedin\.com|github\.com|portfolio|https?:\/\/)/i.test(resume) ? 2 : 0),
      fix: "Add email, phone, and a relevant LinkedIn/GitHub/portfolio link.",
    },
    {
      name: "Standard sections",
      points: 20,
      score: ["experience", "education", "skills", "summary", "projects", "certifications"]
        .reduce((sum, section) => sum + (lower.includes(section) ? 4 : 0), 0),
      fix: "Use ATS-standard headings: Summary, Experience, Education, Skills, Projects/Certifications.",
    },
    {
      name: "Length",
      points: 15,
      score: wordCount >= 400 && wordCount <= 1000 ? 15 : wordCount >= 250 && wordCount <= 1200 ? 10 : 5,
      fix: "Aim for roughly 400–1000 words with concise, relevant bullets.",
    },
    {
      name: "Action verbs",
      points: 15,
      score: Math.min(15, actionVerbs.filter((verb) => lower.includes(verb)).length * 3),
      fix: "Start bullets with strong verbs like built, led, improved, launched, reduced, or automated.",
    },
    {
      name: "Quantified achievements",
      points: 15,
      score: Math.min(15, (resume.match(/(\d+%|\$\d|\d+x|\d+\+|\b\d{2,}\b)/gi) ?? []).length * 3),
      fix: "Add metrics: percentages, revenue, time saved, users, volume, or team size.",
    },
  ];

  let keywordScore = 0;
  let keywordLine = "Keyword overlap: not scored because no job_description was provided.";
  const missingKeywords: string[] = [];
  if (jobDescription) {
    const jdKeywords = uniqueKeywords(jobDescription);
    const resumeTokens = new Set(tokenize(resume));
    const matched = jdKeywords.filter((keyword) => resumeTokens.has(keyword));
    keywordScore = jdKeywords.length ? Math.round((matched.length / jdKeywords.length) * 20) : 0;
    missingKeywords.push(...jdKeywords.filter((keyword) => !resumeTokens.has(keyword)).slice(0, 8));
    keywordLine = `Keyword overlap: ${matched.length}/${jdKeywords.length} important job keywords matched (${keywordScore}/20).`;
  }

  const baseScore = checks.reduce((sum, check) => sum + Math.min(check.points, check.score), 0);
  const totalPossible = jobDescription ? 100 : 80;
  const rawScore = baseScore + keywordScore;
  const score = Math.max(0, Math.min(100, Math.round((rawScore / totalPossible) * 100)));

  const fixes = checks
    .map((check) => ({ gap: check.points - Math.min(check.points, check.score), fix: check.fix }))
    .concat(jobDescription && missingKeywords.length ? [{ gap: 20 - keywordScore, fix: `Mirror relevant job keywords naturally: ${missingKeywords.join(", ")}.` }] : [])
    .filter((item) => item.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${item.fix}`);

  const breakdown = checks
    .map((check) => `- ${check.name}: ${Math.min(check.points, check.score)}/${check.points}`)
    .concat(jobDescription ? [`- Job keyword overlap: ${keywordScore}/20`] : []);

  const text = [
    `ATS resume score: ${score}/100`,
    `Word count: ${wordCount}`,
    keywordLine,
    "",
    "Breakdown:",
    ...breakdown,
    "",
    "Top fixes:",
    ...(fixes.length ? fixes : ["1. Strong foundation — tailor keywords and metrics for each job posting."]),
    "",
    appPromos.cvDesk,
  ].join("\n");

  return { content: [{ type: "text", text }] };
}

function priceToWorkHours(input: Record<string, unknown>): ToolResult {
  const price = numberParam(input, "price")!;
  const hourlyWage = numberParam(input, "hourly_wage", false);
  const monthlySalary = numberParam(input, "monthly_salary", false);
  if (!hourlyWage && !monthlySalary) throw new Error("Provide either 'hourly_wage' or 'monthly_salary'.");

  const effectiveHourly = hourlyWage ?? monthlySalary! / 173.33;
  const hours = price / effectiveHourly;
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  const days = hours / 8;
  const source = hourlyWage ? `hourly wage ${formatMoney(hourlyWage)}` : `monthly salary ${formatMoney(monthlySalary!)} ÷ 173.33 work hours`;

  const text = [
    `${formatMoney(price)} costs about ${hours.toFixed(2)} work hours (${wholeHours}h ${minutes}m).`,
    `That is roughly ${days.toFixed(2)} eight-hour workdays, based on ${source}.`,
    `Formula: price ÷ effective hourly wage = work hours.`,
    "",
    appPromos.hoursTag,
  ].join("\n");
  return { content: [{ type: "text", text }] };
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

type PhotoSpec = {
  aliases: string[];
  size: string;
  rules: string;
};

const photoSpecs: PhotoSpec[] = [
  { aliases: ["us", "usa", "united states", "america"], size: "2 x 2 in (51 x 51 mm), typically 600 x 600 px digital", rules: "White/off-white background, neutral expression, full face, no glasses for passport photos." },
  { aliases: ["schengen", "eu", "europe", "france", "germany", "italy", "spain", "netherlands", "belgium", "portugal", "austria", "greece", "switzerland"], size: "35 x 45 mm", rules: "Plain light background, head about 32–36 mm, neutral expression, recent photo." },
  { aliases: ["uk", "united kingdom", "britain", "england"], size: "35 x 45 mm", rules: "Plain cream/light grey background, head 29–34 mm, neutral expression, no shadows." },
  { aliases: ["china", "prc"], size: "33 x 48 mm", rules: "White or light blue background depending on document, head width 15–22 mm, head height 28–33 mm." },
  { aliases: ["india"], size: "2 x 2 in (51 x 51 mm)", rules: "White/light background, full-face view, neutral expression, recent photo." },
  { aliases: ["japan"], size: "35 x 45 mm", rules: "Plain background, head 32–36 mm from chin to top, taken within 6 months." },
  { aliases: ["canada"], size: "50 x 70 mm", rules: "Plain white/light background, face height 31–36 mm, photographer/date often required for passport." },
  { aliases: ["australia"], size: "35 x 45 mm", rules: "Plain light background, face 32–36 mm, neutral expression, no retouching." },
  { aliases: ["new zealand", "nz"], size: "35 x 45 mm", rules: "Plain light background, head 32–36 mm, eyes open, neutral expression." },
  { aliases: ["taiwan", "roc"], size: "35 x 45 mm", rules: "White background, head 32–36 mm, front-facing, recent color photo." },
  { aliases: ["hong kong", "hk"], size: "40 x 50 mm", rules: "White background, head 32–36 mm, full face, neutral expression." },
  { aliases: ["singapore"], size: "35 x 45 mm", rules: "White background, face 25–35 mm high, no shadows, recent photo." },
  { aliases: ["south korea", "korea", "republic of korea"], size: "35 x 45 mm", rules: "White background, head 32–36 mm, neutral expression, taken within 6 months." },
  { aliases: ["thailand"], size: "35 x 45 mm", rules: "Plain light background, full face, neutral expression; requirements vary by visa/passport service." },
  { aliases: ["malaysia"], size: "35 x 50 mm", rules: "White background, dark clothing recommended, face centered and neutral." },
  { aliases: ["indonesia"], size: "4 x 6 cm", rules: "Usually white/red/blue background depending on document; verify the target application." },
  { aliases: ["philippines"], size: "35 x 45 mm", rules: "White background, full face, neutral expression, recent color photo." },
  { aliases: ["vietnam"], size: "4 x 6 cm", rules: "White background, full face, no hat/glasses, recent photo." },
  { aliases: ["mexico"], size: "35 x 45 mm", rules: "White background, front view, no glasses, hair away from face." },
  { aliases: ["brazil"], size: "5 x 7 cm", rules: "White background, recent front-facing color photo, neutral expression." },
  { aliases: ["argentina"], size: "4 x 4 cm", rules: "White/light blue background depending on document, front-facing, recent photo." },
  { aliases: ["turkey", "turkiye"], size: "50 x 60 mm", rules: "Biometric photo, white background, face height commonly 32–36 mm." },
  { aliases: ["russia"], size: "35 x 45 mm", rules: "Light background, full face, neutral expression, matte paper often requested." },
  { aliases: ["ukraine"], size: "35 x 45 mm", rules: "Plain light background, face centered, neutral expression." },
  { aliases: ["uae", "united arab emirates", "dubai"], size: "40 x 60 mm", rules: "White background, high-quality biometric-style photo; emirate/document rules can vary." },
  { aliases: ["saudi arabia", "ksa"], size: "2 x 2 in (51 x 51 mm)", rules: "White background, full-face view; visa/passport rules may differ." },
  { aliases: ["israel"], size: "35 x 45 mm", rules: "Plain light background, front-facing, neutral expression." },
  { aliases: ["south africa"], size: "35 x 45 mm", rules: "Plain background, head and shoulders visible, neutral expression." },
  { aliases: ["egypt"], size: "4 x 6 cm", rules: "White background, front-facing, recent photo." },
  { aliases: ["nigeria"], size: "35 x 45 mm", rules: "White/off-white background, full face, neutral expression." },
];

function passportPhotoSpec(input: Record<string, unknown>): ToolResult {
  const country = textParam(input, "country").toLowerCase();
  const spec = photoSpecs.find((item) => item.aliases.some((alias) => country === alias || country.includes(alias)));
  const matched = spec ?? {
    aliases: [country],
    size: "35 x 45 mm (common passport/ID default)",
    rules: "Use a plain light background, centered full-face crop, neutral expression, no shadows, and verify the official requirement before submitting.",
  };
  const label = spec ? `Spec for ${input.country}:` : `No exact built-in match for '${input.country}'. Common fallback guidance:`;
  const text = [
    label,
    `- Photo size: ${matched.size}`,
    `- Key rules: ${matched.rules}`,
    spec ? "Always verify with the issuing authority because rules can change." : "Please verify with the issuing authority; country/document-specific rules may differ.",
    "",
    appPromos.snapport,
  ].join("\n");
  return { content: [{ type: "text", text }] };
}

function realCostAbroad(input: Record<string, unknown>): ToolResult {
  const amount = numberParam(input, "amount")!;
  const fromCurrency = textParam(input, "from_currency").toUpperCase();
  const toCurrency = textParam(input, "to_currency").toUpperCase();
  const sampleRate = numberParam(input, "exchange_rate", false);
  const feePercent = numberParam(input, "fee_percent", false) ?? 0;

  const lines = [
    `Cloudflare Workers MCP tools should not guess live FX rates without an exchange-rate API key.`,
    `Formula: ${amount} ${fromCurrency} × live ${fromCurrency}/${toCurrency} rate × (1 + foreign transaction fee %) = real cost in ${toCurrency}.`,
  ];
  if (sampleRate) {
    const converted = amount * sampleRate * (1 + feePercent / 100);
    lines.push(`Using the provided exchange_rate ${sampleRate} and fee ${feePercent}%: ${converted.toFixed(2)} ${toCurrency}.`);
  }
  lines.push(
    "Tip: compare the card network rate, ATM/operator markup, and foreign transaction fee before paying.",
    "",
    appPromos.gMoney,
  );
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

const tools: Tool[] = [
  {
    name: "ats_resume_score",
    description: "Score a resume for ATS-friendliness and return a practical breakdown with top fixes.",
    inputSchema: {
      type: "object",
      properties: {
        resume_text: { type: "string", description: "Plain-text resume content." },
        job_description: { type: "string", description: "Optional job description for keyword overlap scoring." },
      },
      required: ["resume_text"],
      additionalProperties: false,
    },
    handler: atsResumeScore,
  },
  {
    name: "price_to_work_hours",
    description: "Convert a purchase price into hours and days of work based on wage or salary.",
    inputSchema: {
      type: "object",
      properties: {
        price: { type: "number", exclusiveMinimum: 0 },
        hourly_wage: { type: "number", exclusiveMinimum: 0 },
        monthly_salary: { type: "number", exclusiveMinimum: 0 },
      },
      required: ["price"],
      anyOf: [{ required: ["hourly_wage"] }, { required: ["monthly_salary"] }],
      additionalProperties: false,
    },
    handler: priceToWorkHours,
  },
  {
    name: "passport_photo_spec",
    description: "Return passport or ID photo size and rules for a country, with a 30-country built-in table.",
    inputSchema: {
      type: "object",
      properties: {
        country: { type: "string", description: "Country or region name, e.g. US, Japan, Schengen, Taiwan." },
      },
      required: ["country"],
      additionalProperties: false,
    },
    handler: passportPhotoSpec,
  },
  {
    name: "real_cost_abroad",
    description: "Explain the real travel cost formula across currencies; optionally calculate with a supplied rate.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number", exclusiveMinimum: 0 },
        from_currency: { type: "string", minLength: 3, maxLength: 3 },
        to_currency: { type: "string", minLength: 3, maxLength: 3 },
        exchange_rate: { type: "number", exclusiveMinimum: 0, description: "Optional known live rate." },
        fee_percent: { type: "number", minimum: 0, description: "Optional card/ATM fee percentage." },
      },
      required: ["amount", "from_currency", "to_currency"],
      additionalProperties: false,
    },
    handler: realCostAbroad,
  },
];

const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

function ok(id: JsonRpcId | undefined, result: Json): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }), { headers: jsonHeaders });
}

function rpcError(id: JsonRpcId | undefined, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }), { status: 200, headers: jsonHeaders });
}

function toolDefinitions(): Json[] {
  return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema: inputSchema as Json }));
}

async function handleRpc(request: Request): Promise<Response> {
  let payload: JsonRpcRequest;
  try {
    payload = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error: request body must be JSON.");
  }

  if (payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
    return rpcError(payload.id, -32600, "Invalid Request: expected JSON-RPC 2.0 object with method.");
  }

  if (payload.method === "notifications/initialized") {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  const id = payload.id;
  if (id === undefined) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  switch (payload.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "lumi-mcp", version: "1.0.0" },
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: toolDefinitions() });
    case "tools/call": {
      const params = payload.params as { name?: unknown; arguments?: unknown } | undefined;
      const name = params?.name;
      if (typeof name !== "string") return rpcError(id, -32602, "Invalid params: tools/call requires a string 'name'.");
      const tool = toolMap.get(name);
      if (!tool) return rpcError(id, -32602, `Unknown tool '${name}'.`);
      const args = params?.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? params.arguments as Record<string, unknown>
        : {};
      try {
        return ok(id, tool.handler(args) as unknown as Json);
      } catch (error) {
        return rpcError(id, -32602, error instanceof Error ? error.message : "Invalid tool arguments.");
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${payload.method}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (url.pathname === "/") {
      return new Response("Lumi MCP is running. POST JSON-RPC 2.0 requests to /mcp.", { headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (url.pathname !== "/mcp") {
      return new Response(JSON.stringify({ error: "Not found. Use POST /mcp." }), { status: 404, headers: jsonHeaders });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed. Use POST /mcp." }), { status: 405, headers: jsonHeaders });
    }
    return handleRpc(request);
  },
};
