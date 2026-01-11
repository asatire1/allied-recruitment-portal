/**
 * Allied Recruitment Portal - Indeed Job Import
 * Parses Indeed UK job listings using Claude AI
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import Anthropic from '@anthropic-ai/sdk'

// Re-use the same secret as CV parsing
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY')

// ============================================================================
// TYPES
// ============================================================================

interface ParseIndeedJobRequest {
  url?: string
  text?: string // Allow pasting raw job text as fallback
  image?: string // Base64 encoded image of job listing
}

interface ParsedJobData {
  jobTitle: string
  description: string
  employmentType: 'Full-time' | 'Part-time' | 'Temporary' | 'Contract' | 'Locum' | null
  hoursPerWeek: number | null
  shiftPattern: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryPeriod: 'hourly' | 'annual' | null
  salaryNotes: string | null
  benefits: string[] | null
  location: string | null
  requirements: string | null
  qualificationsRequired: string | null
  desirable: string | null
  inferredJobType: string | null
  inferredCategory: 'clinical' | 'dispensary' | 'retail' | 'management' | 'support' | null
  requiresGPhC: boolean
  requiresDBS: boolean
  sourceUrl: string
  rawContent: string
}

interface ParseIndeedJobResponse {
  success: boolean
  data?: ParsedJobData
  error?: {
    code: 'INVALID_URL' | 'FETCH_FAILED' | 'PARSE_FAILED' | 'NOT_FOUND' | 'BLOCKED'
    message: string
  }
}

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Validates that the URL is a valid Indeed UK job listing
 */
function validateIndeedUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url)
    
    // Check domain
    const validDomains = ['uk.indeed.com', 'www.indeed.co.uk', 'indeed.co.uk']
    if (!validDomains.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
      return { 
        valid: false, 
        error: 'Please use an Indeed UK job URL (uk.indeed.com)' 
      }
    }
    
    // Check it looks like a job page
    const isJobPage = 
      parsed.pathname.includes('/viewjob') ||
      parsed.pathname.includes('/job/') ||
      parsed.pathname.includes('/jobs/') ||
      parsed.searchParams.has('jk') ||
      parsed.pathname.match(/\/[a-f0-9]{16}/)
    
    if (!isJobPage) {
      return { 
        valid: false, 
        error: 'This doesn\'t look like an Indeed job listing URL' 
      }
    }
    
    return { valid: true }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}

// ============================================================================
// HTML FETCHING
// ============================================================================

/**
 * Fetches the Indeed job page HTML with timeout
 */
async function fetchIndeedPage(url: string): Promise<string> {
  // Create an AbortController for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout
  
  try {
    // Use native fetch (available in Node 18+)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('JOB_NOT_FOUND')
      }
      if (response.status === 403 || response.status === 429) {
        throw new Error('BLOCKED')
      }
      throw new Error(`HTTP ${response.status}`)
    }
    
    const html = await response.text()
    
    // Check if we got a CAPTCHA or blocked page
    if (html.includes('captcha') || html.includes('blocked') || html.includes('unusual traffic')) {
      throw new Error('BLOCKED')
    }
    
    return html
  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('TIMEOUT')
      }
      throw error
    }
    throw new Error('FETCH_FAILED')
  }
}

/**
 * Extracts the main job content from HTML
 * Removes scripts, styles, and navigation to reduce token usage
 */
function extractJobContent(html: string): string {
  // Remove script tags
  let content = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  
  // Remove style tags
  content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  
  // Remove HTML comments
  content = content.replace(/<!--[\s\S]*?-->/g, '')
  
  // Remove header and footer sections (typically navigation)
  content = content.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
  content = content.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
  content = content.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
  
  // Try to extract just the job description container
  // Indeed uses various class names, try to find the main content
  const jobDescriptionPatterns = [
    /id="jobDescriptionText"[^>]*>([\s\S]*?)<\/div>/i,
    /class="jobsearch-jobDescriptionText[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /class="job-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ]
  
  for (const pattern of jobDescriptionPatterns) {
    const match = content.match(pattern)
    if (match && match[1] && match[1].length > 200) {
      // Found a substantial job description, but keep surrounding context too
      break
    }
  }
  
  // Convert HTML to more readable text while preserving structure
  content = content
    // Convert line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Convert paragraphs
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    // Convert list items  
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    // Convert headings
    .replace(/<h[1-6][^>]*>/gi, '\n### ')
    .replace(/<\/h[1-6]>/gi, '\n')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&pound;/g, '£')
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim()
  
  // Limit content length to avoid token limits (keep first ~15000 chars)
  if (content.length > 15000) {
    content = content.substring(0, 15000) + '\n\n[Content truncated]'
  }
  
  return content
}

// ============================================================================
// CLAUDE AI PARSING
// ============================================================================

/**
 * Uses Claude to parse the job listing content (text or image)
 */
async function parseWithClaude(
  content: string, 
  sourceUrl: string,
  apiKey: string,
  imageBase64?: string
): Promise<ParsedJobData> {
  const client = new Anthropic({ apiKey })
  
  const systemPrompt = `You are a job listing parser specializing in UK pharmacy and healthcare recruitment.
Your task is to extract structured data from job listings (either from text or screenshots).

IMPORTANT CONTEXT:
- This is for a UK pharmacy recruitment system
- Job types include: Pharmacist, Pharmacy Technician, Dispenser, Healthcare Assistant, Counter Assistant, Delivery Driver, etc.
- Categories: clinical (pharmacists, technicians), dispensary (dispensers), retail (counter staff), management, support (drivers, cleaners, admin)
- GPhC registration is required for Pharmacists and Pharmacy Technicians
- Salaries in the UK are typically annual (£25,000-£60,000 for pharmacy roles) or hourly (£10-£30)

Extract the information and return ONLY a valid JSON object with no additional text.`

  const jsonSchema = `{
  "jobTitle": "string - the exact job title",
  "description": "string - the full job description, cleaned up and formatted nicely with paragraphs preserved",
  "employmentType": "Full-time" | "Part-time" | "Temporary" | "Contract" | "Locum" | null,
  "hoursPerWeek": number | null (extract from text like "37.5 hours" or "40 hours per week"),
  "shiftPattern": "string describing work pattern, e.g. 'Monday to Friday, 9am-6pm' or 'Rotating shifts including weekends'" | null,
  "salaryMin": number | null (annual salary or null, e.g. 45000 from "£45,000 - £55,000"),
  "salaryMax": number | null (annual salary or null),
  "salaryPeriod": "hourly" | "annual" | null,
  "salaryNotes": "string with any extra salary info like 'DOE', 'Plus benefits', 'Competitive'" | null,
  "benefits": ["array", "of", "benefits"] | null,
  "location": "string - city/area mentioned" | null,
  "requirements": "string - essential requirements/responsibilities, one per line" | null,
  "qualificationsRequired": "string - required qualifications like 'GPhC registered', 'NVQ Level 2'" | null,
  "desirable": "string - nice to have skills/experience" | null,
  "inferredJobType": "Pharmacist" | "Pharmacy Technician" | "Dispenser" | "Healthcare Assistant" | "Counter Assistant" | "Delivery Driver" | "Store Manager" | "Area Manager" | "Admin" | null,
  "inferredCategory": "clinical" | "dispensary" | "retail" | "management" | "support" | null,
  "requiresGPhC": boolean (true if pharmacist or pharmacy technician role),
  "requiresDBS": boolean (true if mentions DBS check or working with vulnerable people)
}`

  const parsingRules = `PARSING RULES:
1. For salary, convert hourly to annual if only hourly given (multiply by 2080 for full-time)
2. If salary shows a range like "£45,000 - £55,000 a year", extract both min and max
3. If salary is "Competitive", "Negotiable", or not specified, set min/max to null and put text in salaryNotes
4. Clean up the description - remove excessive whitespace, preserve paragraph breaks, format as readable text
5. For inferredJobType, map common titles:
   - "Pharmacist Manager" / "Lead Pharmacist" / "Senior Pharmacist" → "Pharmacist"
   - "Pharmacy Assistant" / "Pharmacy Support" → "Healthcare Assistant"  
   - "Accuracy Checking Technician" / "ACT" → "Pharmacy Technician"
   - "Dispensing Assistant" / "Dispenser" → "Dispenser"
6. requiresGPhC should be true for any Pharmacist or Pharmacy Technician role
7. If job is in a pharmacy setting but role is administrative, use category "support"
8. Extract benefits like: pension, holiday days, staff discount, training, bonus
9. For hoursPerWeek, look for patterns like "37.5 hours", "40h", "Full time (37.5)"
10. For shiftPattern, extract specific days and times if mentioned

Return ONLY the JSON object, no explanation or markdown.`

  // Build message content based on whether we have an image or text
  let messageContent: Anthropic.MessageCreateParams['messages'][0]['content']
  
  if (imageBase64) {
    // Parse from screenshot image
    messageContent = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: imageBase64.replace(/^data:image\/\w+;base64,/, ''), // Remove data URL prefix if present
        },
      },
      {
        type: 'text',
        text: `Extract job details from this screenshot of a job listing.

Return a JSON object with these exact fields:
${jsonSchema}

${parsingRules}`,
      },
    ]
  } else {
    // Parse from text content
    messageContent = `Parse this job listing and extract the details.

SOURCE: ${sourceUrl}

JOB LISTING CONTENT:
${content}

Return a JSON object with these exact fields:
${jsonSchema}

${parsingRules}`
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      { role: 'user', content: messageContent }
    ],
    system: systemPrompt,
  })
  
  // Extract JSON from response
  const textContent = response.content.find(c => c.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude')
  }
  
  let jsonText = textContent.text.trim()
  
  // Remove markdown code blocks if present
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }
  
  // Try to extract JSON if it's wrapped in other text
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    jsonText = jsonMatch[0]
  }
  
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch (parseError) {
    console.error('[parseWithClaude] JSON parse error:', parseError)
    console.error('[parseWithClaude] Raw text:', jsonText.substring(0, 500))
    throw new Error('JSON parse failed: ' + (parseError instanceof Error ? parseError.message : 'Unknown'))
  }
  
  // Validate required fields
  if (!parsed.jobTitle) {
    throw new Error('JSON missing jobTitle field')
  }
  
  return {
    ...parsed,
    sourceUrl,
    rawContent: content.substring(0, 5000), // Store truncated raw content for debugging
  }
}

// ============================================================================
// MAIN CLOUD FUNCTION
// ============================================================================

export const parseIndeedJob = onCall<ParseIndeedJobRequest, Promise<ParseIndeedJobResponse>>(
  {
    secrets: [anthropicApiKey],
    timeoutSeconds: 60,
    memory: '512MiB',
    maxInstances: 5,
    region: 'europe-west2',
    cors: [
      'https://allied-recruitment.web.app',
      'https://recruitment-633bd.web.app',
      'http://localhost:5173',
      'http://localhost:3000',
    ],
  },
  async (request): Promise<ParseIndeedJobResponse> => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be logged in to import jobs')
    }
    
    const { url, text, image } = request.data
    
    // Must provide either URL, text, or image
    if (!url && !text && !image) {
      return {
        success: false,
        error: {
          code: 'INVALID_URL',
          message: 'Please provide a job URL, paste text, or upload a screenshot',
        },
      }
    }
    
    try {
      let content: string
      let sourceUrl: string
      let imageData: string | undefined
      
      if (image) {
        // User uploaded a screenshot - will be parsed by Claude vision
        console.log('[parseIndeedJob] Parsing screenshot image')
        content = '' // Content will be extracted from image by Claude
        sourceUrl = 'screenshot'
        imageData = image
      } else if (text) {
        // User pasted job text directly - use as-is
        console.log('[parseIndeedJob] Parsing pasted text')
        content = text.trim()
        sourceUrl = 'pasted-text'
        
        if (content.length < 50) {
          return {
            success: false,
            error: {
              code: 'PARSE_FAILED',
              message: 'The pasted text is too short. Please paste the full job description.',
            },
          }
        }
      } else if (url) {
        // Validate URL
        const validation = validateIndeedUrl(url)
        if (!validation.valid) {
          return {
            success: false,
            error: {
              code: 'INVALID_URL',
              message: validation.error || 'Invalid URL',
            },
          }
        }
        
        sourceUrl = url
        console.log(`[parseIndeedJob] Fetching: ${url}`)
        
        // Fetch the Indeed page
        const html = await fetchIndeedPage(url)
        
        // Extract job content from HTML
        content = extractJobContent(html)
      } else {
        return {
          success: false,
          error: {
            code: 'INVALID_URL',
            message: 'Please provide a job URL, paste text, or upload a screenshot',
          },
        }
      }
      
      // For image mode, skip content length check
      if (!imageData) {
        console.log(`[parseIndeedJob] Content length: ${content.length} chars`)
        
        if (content.length < 100) {
          return {
            success: false,
            error: {
              code: 'PARSE_FAILED',
              message: 'Could not extract job content from the page. The job may have been removed.',
            },
          }
        }
      }
      
      // Parse with Claude
      const apiKey = anthropicApiKey.value()
      if (!apiKey) {
        throw new HttpsError('failed-precondition', 'AI parsing is not configured')
      }
      
      const parsedJob = await parseWithClaude(content, sourceUrl, apiKey, imageData)
      console.log(`[parseIndeedJob] Successfully parsed job: ${parsedJob.jobTitle}`)
      
      return {
        success: true,
        data: parsedJob,
      }
      
    } catch (error) {
      console.error('[parseIndeedJob] Error:', error)
      
      const message = error instanceof Error ? error.message : 'Unknown error'
      
      if (message === 'JOB_NOT_FOUND') {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'This job listing could not be found. It may have been removed from Indeed.',
          },
        }
      }
      
      if (message === 'BLOCKED') {
        return {
          success: false,
          error: {
            code: 'BLOCKED',
            message: 'Indeed is temporarily blocking requests. Please try again in a few minutes, or copy/paste the job details manually.',
          },
        }
      }
      
      if (message === 'TIMEOUT') {
        return {
          success: false,
          error: {
            code: 'FETCH_FAILED',
            message: 'The request timed out. Indeed may be slow or temporarily unavailable. Please try again.',
          },
        }
      }
      
      if (message.includes('JSON')) {
        return {
          success: false,
          error: {
            code: 'PARSE_FAILED',
            message: 'Could not parse the job listing. The page format may have changed.',
          },
        }
      }
      
      return {
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: `Failed to import job: ${message}`,
        },
      }
    }
  }
)
