/**
 * JMeter Utilities for DynoLLM
 * - JMX (Apache JMeter XML) Exporter
 * - Workload Concurrency Topology Calculator for live interactive curve previews
 * - Industry-standard Test Plan Blueprints / Templates
 * - cURL and Python API execution generators
 */

/**
 * Pre-configured industry-standard Test Plan Blueprints
 */
export const JMETER_BLUEPRINTS = [
  {
    id: 'smoke',
    title: 'Smoke Sanity Test',
    badge: '1 VU • 15s',
    desc: 'Rapid low-impact health check to verify endpoint connectivity, authentication, and token generation.',
    config: {
      name: 'Smoke Sanity Test',
      description: 'Single virtual user baseline check across 15 seconds to ensure endpoint readiness.',
      thread_groups: [
        {
          id: 'tg-smoke',
          name: 'Smoke Sampler',
          pattern: 'constant',
          target_users: 1,
          duration_seconds: 15,
          rampup_step_users: 1,
          rampup_step_seconds: 5,
          temperature: 0.7,
          max_tokens: 128,
          request_timeout: 30.0,
        },
      ],
      config_elements: [
        {
          type: 'think_time',
          timer_type: 'constant',
          delay_ms: 500,
          min_ms: 500,
          max_ms: 500,
        },
      ],
      assertions: [
        { type: 'error_rate', name: 'Zero Error Tolerance', max_pct: 0.0 },
        { type: 'latency', name: 'Smoke Latency p95', p95_max_ms: 3000 },
      ],
    },
  },
  {
    id: 'stepped_ramp',
    title: 'Stepped Scalability Ramp',
    badge: '5 → 50 VUs • 120s',
    desc: 'JMeter Stepping Thread Group equivalent: progressive ramp from 5 to 50 concurrent users to find saturation knee.',
    config: {
      name: 'Stepped Scalability Ramp',
      description: 'Progressive stepped ramp from 5 to 50 users in 5 steps to locate the throughput plateau and latency inflection point.',
      thread_groups: [
        {
          id: 'tg-ramp',
          name: 'Stepped Ingestion Group',
          pattern: 'rampup',
          target_users: 50,
          duration_seconds: 120,
          rampup_step_users: 10,
          rampup_step_seconds: 20,
          temperature: 0.7,
          max_tokens: 256,
          request_timeout: 90.0,
        },
      ],
      config_elements: [
        {
          type: 'think_time',
          timer_type: 'uniform',
          min_ms: 200,
          max_ms: 800,
        },
        {
          type: 'csv_data_set',
          mode: 'random',
          data: 'Explain transformer self-attention in detail.\nWrite a python script to parse JSON.\nWhat are the trade-offs between Redis and Memcached?\nSummarize the history of neural networks.\nHow does KV caching work in LLM inference engines?',
        },
      ],
      assertions: [
        { type: 'latency', name: 'p95 Latency SLA', p95_max_ms: 2500 },
        { type: 'p99_latency', name: 'p99 Latency SLA', p99_max_ms: 4500 },
        { type: 'error_rate', name: 'Error Rate SLA', max_pct: 5.0 },
        { type: 'ttft', name: 'TTFT SLA', max_ms: 1200 },
      ],
    },
  },
  {
    id: 'spike_surge',
    title: 'Impulse Spike Surge',
    badge: '10 → 60 VUs Surge',
    desc: 'Simulates a sudden breaking news or viral influx: baseline traffic with sharp burst to test request queuing.',
    config: {
      name: 'Impulse Spike Surge',
      description: 'Sustained moderate baseline load followed by an acute burst spike to stress scheduler queues and KV cache limits.',
      thread_groups: [
        {
          id: 'tg-spike',
          name: 'Viral Traffic Spike',
          pattern: 'spike',
          target_users: 60,
          duration_seconds: 90,
          rampup_step_users: 20,
          rampup_step_seconds: 10,
          temperature: 0.8,
          max_tokens: 256,
          request_timeout: 120.0,
        },
      ],
      config_elements: [
        {
          type: 'think_time',
          timer_type: 'gaussian',
          delay_ms: 400,
          deviation_ms: 150,
        },
      ],
      assertions: [
        { type: 'error_rate', name: 'Spike Error Threshold', max_pct: 10.0 },
        { type: 'latency', name: 'Spike p95 Latency SLA', p95_max_ms: 5000 },
      ],
    },
  },
  {
    id: 'stress_breaking',
    title: 'Stress to Saturation',
    badge: '100 VUs Peak • 180s',
    desc: 'Pushes concurrency beyond nominal limits until the inference engine throttles, queues exhaust, or TTFT degrades.',
    config: {
      name: 'Stress to Saturation Point',
      description: 'Heavy sustained concurrency to evaluate vLLM / TGI memory limits, GPU preemption, and max queue depth.',
      thread_groups: [
        {
          id: 'tg-stress',
          name: 'Heavy Load Group',
          pattern: 'stress',
          target_users: 100,
          duration_seconds: 180,
          rampup_step_users: 15,
          rampup_step_seconds: 25,
          temperature: 0.7,
          max_tokens: 512,
          request_timeout: 150.0,
        },
      ],
      config_elements: [
        {
          type: 'token_budget',
          max_tokens: 512,
          temperature: 0.7,
        },
      ],
      assertions: [
        { type: 'error_rate', name: 'Stress Error Cap', max_pct: 15.0 },
        { type: 'tokens_per_second', name: 'Minimum Cluster TPS', min_tps: 50.0 },
      ],
    },
  },
  {
    id: 'multi_group_ab',
    title: 'Multi-Group A/B Load Plan',
    badge: '2 Groups • Multi-Tier',
    desc: 'Simulates heterogeneous traffic: Group 1 generates short interactive queries, Group 2 runs long-form document prompts.',
    config: {
      name: 'Multi-Group Heterogeneous Traffic',
      description: 'Simulates mixed production workloads with both fast conversational queries and heavy analytical completions.',
      thread_groups: [
        {
          id: 'tg-interactive',
          name: 'Interactive Chatbot (Fast TTFT)',
          pattern: 'constant',
          target_users: 25,
          duration_seconds: 60,
          rampup_step_users: 5,
          rampup_step_seconds: 10,
          temperature: 0.5,
          max_tokens: 96,
          request_timeout: 60.0,
        },
        {
          id: 'tg-longform',
          name: 'Long-Form Processing (High Tokens)',
          pattern: 'rampup',
          target_users: 15,
          duration_seconds: 60,
          rampup_step_users: 5,
          rampup_step_seconds: 15,
          temperature: 0.7,
          max_tokens: 512,
          request_timeout: 120.0,
        },
      ],
      config_elements: [
        {
          type: 'think_time',
          timer_type: 'uniform',
          min_ms: 300,
          max_ms: 1000,
        },
      ],
      assertions: [
        { type: 'latency', name: 'Overall p95 SLA', p95_max_ms: 3000 },
        { type: 'quality', name: 'Quality Integrity SLA', min_rate: 0.98 },
        { type: 'error_rate', name: 'Combined Error Rate', max_pct: 3.0 },
      ],
    },
  },
]

/**
 * Calculates second-by-second simulated concurrency topology for all thread groups.
 * Used for the interactive Recharts visualizer.
 */
export function computeWorkloadTopology(plan) {
  const groups = Array.isArray(plan?.thread_groups) ? plan.thread_groups : []
  if (groups.length === 0) {
    return {
      totalDurationSeconds: 0,
      peakUsers: 0,
      totalEstimatedRequests: 0,
      stagesCount: 0,
      timelineData: [],
    }
  }

  // Determine duration per group
  let maxDuration = 0
  let cumulativeDuration = 0
  const groupSchedules = groups.map((g, idx) => {
    const target = Number(g.target_users) || 10
    const duration = Math.max(10, Number(g.duration_seconds) || 60)
    const stepUsers = Math.max(1, Number(g.rampup_step_users) || 5)
    const stepSeconds = Math.max(1, Number(g.rampup_step_seconds) || 10)
    const pattern = g.pattern || 'rampup'

    maxDuration = Math.max(maxDuration, duration)
    cumulativeDuration += duration

    return {
      id: g.id || `tg-${idx + 1}`,
      name: g.name || `Thread Group ${idx + 1}`,
      target,
      duration,
      stepUsers,
      stepSeconds,
      pattern,
    }
  })

  // We sample 25-40 discrete points across total duration for smooth curve
  const sampleSteps = 35
  const stepInterval = Math.max(1, Math.ceil(maxDuration / sampleSteps))
  const samplePoints = []

  let peakUsers = 0
  let sumUsersSeconds = 0

  for (let sec = 0; sec <= maxDuration; sec += stepInterval) {
    const point = {
      second: sec,
      time: formatSecondsToMMSS(sec),
      totalUsers: 0,
    }

    groupSchedules.forEach((g) => {
      let usersAtSec = 0
      if (sec <= g.duration) {
        if (g.pattern === 'constant') {
          usersAtSec = g.target
        } else if (g.pattern === 'rampup') {
          const totalSteps = Math.ceil(g.target / g.stepUsers)
          const rampDuration = totalSteps * g.stepSeconds
          if (sec < rampDuration) {
            const currentStep = Math.floor(sec / g.stepSeconds) + 1
            usersAtSec = Math.min(g.target, currentStep * g.stepUsers)
          } else {
            usersAtSec = g.target
          }
        } else if (g.pattern === 'spike') {
          const baseline = Math.max(1, Math.round(g.target * 0.15))
          const spikeStart = Math.round(g.duration * 0.3)
          const spikeEnd = Math.round(g.duration * 0.6)
          if (sec >= spikeStart && sec <= spikeEnd) {
            usersAtSec = g.target
          } else {
            usersAtSec = baseline
          }
        } else if (g.pattern === 'stress') {
          // Continuous staircase stepping up to and beyond
          const currentStep = Math.floor(sec / g.stepSeconds) + 1
          usersAtSec = Math.min(Math.round(g.target * 1.3), currentStep * g.stepUsers)
        }
      }

      point[g.name] = usersAtSec
      point.totalUsers += usersAtSec
    })

    peakUsers = Math.max(peakUsers, point.totalUsers)
    sumUsersSeconds += point.totalUsers * stepInterval
    samplePoints.push(point)
  }

  // Ensure final point at maxDuration is present
  if (samplePoints[samplePoints.length - 1]?.second !== maxDuration) {
    const finalPoint = {
      second: maxDuration,
      time: formatSecondsToMMSS(maxDuration),
      totalUsers: 0,
    }
    groupSchedules.forEach((g) => {
      const users = g.duration >= maxDuration ? (g.pattern === 'constant' ? g.target : g.target) : 0
      finalPoint[g.name] = users
      finalPoint.totalUsers += users
    })
    samplePoints.push(finalPoint)
  }

  // Estimated requests based on 1.2 req/sec per user average
  const totalEstimatedRequests = Math.round((sumUsersSeconds * 0.9) / 1)

  return {
    totalDurationSeconds: maxDuration,
    peakUsers,
    totalEstimatedRequests: Math.max(10, totalEstimatedRequests),
    stagesCount: groupSchedules.length,
    timelineData: samplePoints,
    groupSchedules,
  }
}

function formatSecondsToMMSS(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

/**
 * Generates valid Apache JMeter JMX (XML) format from DynoLLM test plan.
 */
export function exportPlanToJmx(plan, runtimes = []) {
  const planName = escapeXml(plan.name || 'DynoLLM Load Test Plan')
  const planDesc = escapeXml(plan.description || 'Exported from DynoLLM JMeter Orchestrator')
  const threadGroups = plan.thread_groups || []
  const configElements = plan.config_elements || []
  const assertions = plan.assertions || []

  // Global variables / UDVs
  const udvElements = configElements.filter((c) => c.type === 'user_defined_variables')
  let udvXml = ''
  if (udvElements.length > 0) {
    const vars = udvElements[0].variables || {}
    const rows = Object.entries(vars)
      .map(
        ([k, v]) => `
          <elementProp name="${escapeXml(k)}" elementType="Argument">
            <stringProp name="Argument.name">${escapeXml(k)}</stringProp>
            <stringProp name="Argument.value">${escapeXml(String(v))}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>`
      )
      .join('\n')

    udvXml = `
      <Arguments guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments">
          ${rows}
        </collectionProp>
      </Arguments>
      <hashTree/>`
  }

  // Thread groups XML
  const threadGroupsXml = threadGroups
    .map((tg, idx) => {
      const tgName = escapeXml(tg.name || `Thread Group ${idx + 1}`)
      const targetUsers = Number(tg.target_users) || 10
      const durationSeconds = Number(tg.duration_seconds) || 60
      const rampupStepSeconds = Number(tg.rampup_step_seconds) || 10
      const rampTime = tg.pattern === 'constant' ? 0 : rampupStepSeconds * 3

      // Find runtime endpoint
      const matchedRt = runtimes.find((r) => r.id === tg.runtime_id)
      const endpoint = matchedRt?.endpoint || 'http://localhost:8000'
      let domain = 'localhost'
      let port = '8000'
      let protocol = 'http'
      let path = '/v1/chat/completions'

      try {
        const u = new URL(endpoint)
        protocol = u.protocol.replace(':', '')
        domain = u.hostname
        port = u.port || (protocol === 'https' ? '443' : '80')
        path = u.pathname.replace(/\/$/, '') + '/v1/chat/completions'
      } catch {
        // use defaults
      }

      // Assertions XML inside thread group
      const assertionsXml = assertions
        .map((a) => {
          if (a.type === 'latency') {
            return `
              <DurationAssertion guiclass="DurationAssertionGui" testclass="DurationAssertion" testname="${escapeXml(a.name || 'Latency SLA')}" enabled="true">
                <stringProp name="DurationAssertion.duration">${Number(a.p95_max_ms) || 2000}</stringProp>
              </DurationAssertion>
              <hashTree/>`
          }
          if (a.type === 'error_rate') {
            return `
              <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="${escapeXml(a.name || 'Error Rate Assertion')}" enabled="true">
                <collectionProp name="Asserion.test_strings">
                  <stringProp name="49586">200</stringProp>
                </collectionProp>
                <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
                <boolProp name="Assertion.assume_success">false</boolProp>
                <intProp name="Assertion.test_type">8</intProp>
              </ResponseAssertion>
              <hashTree/>`
          }
          return ''
        })
        .join('\n')

      const payloadBody = escapeXml(
        JSON.stringify(
          {
            model: tg.model || 'default-model',
            messages: [
              ...(tg.system_prompt ? [{ role: 'system', content: tg.system_prompt }] : []),
              { role: 'user', content: '${prompt}' },
            ],
            temperature: Number(tg.temperature) || 0.7,
            max_tokens: Number(tg.max_tokens) || 256,
            stream: false,
          },
          null,
          2
        )
      )

      return `
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="${tgName}" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <intProp name="LoopController.loops">-1</intProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">${targetUsers}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${rampTime}</stringProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
        <stringProp name="ThreadGroup.duration">${durationSeconds}</stringProp>
        <stringProp name="ThreadGroup.delay">0</stringProp>
        <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
      </ThreadGroup>
      <hashTree>
        <!-- HTTP Header Manager -->
        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true">
          <collectionProp name="HeaderManager.headers">
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">Content-Type</stringProp>
              <stringProp name="Header.value">application/json</stringProp>
            </elementProp>
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">Authorization</stringProp>
              <stringProp name="Header.value">Bearer \${API_KEY}</stringProp>
            </elementProp>
          </collectionProp>
        </HeaderManager>
        <hashTree/>

        <!-- LLM Chat Completion Sampler -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="HTTP Sampler - LLM Chat Completion" enabled="true">
          <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">${payloadBody}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain">${escapeXml(domain)}</stringProp>
          <stringProp name="HTTPSampler.port">${escapeXml(port)}</stringProp>
          <stringProp name="HTTPSampler.protocol">${escapeXml(protocol)}</stringProp>
          <stringProp name="HTTPSampler.contentEncoding">UTF-8</stringProp>
          <stringProp name="HTTPSampler.path">${escapeXml(path)}</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.connect_timeout">10000</stringProp>
          <stringProp name="HTTPSampler.response_timeout">${Math.round((Number(tg.request_timeout) || 120) * 1000)}</stringProp>
        </HTTPSamplerProxy>
        <hashTree>
          ${assertionsXml}
        </hashTree>

        <!-- JMeter Summary & View Results Tree Listeners -->
        <ResultCollector guiclass="SummaryReport" testclass="ResultCollector" testname="Summary Report" enabled="true">
          <boolProp name="ResultCollector.error_logging">false</boolProp>
          <objProp>
            <name>saveConfig</name>
            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <xml>false</xml>
              <fieldNames>true</fieldNames>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <responseDataOnError>false</responseDataOnError>
              <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
              <assertionsResultsToSave>0</assertionsResultsToSave>
              <bytes>true</bytes>
              <sentBytes>true</sentBytes>
              <url>true</url>
              <threadCounts>true</threadCounts>
              <idleTime>true</idleTime>
              <connectTime>true</connectTime>
            </value>
          </objProp>
          <stringProp name="filename"></stringProp>
        </ResultCollector>
        <hashTree/>
      </hashTree>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.5">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${planName}" enabled="true">
      <stringProp name="TestPlan.comments">${planDesc}</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments"/>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>
      ${udvXml}
      ${threadGroupsXml}
    </hashTree>
  </hashTree>
</jmeterTestPlan>`
}

function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') return ''
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case "'":
        return '&apos;'
      case '"':
        return '&quot;'
      default:
        return c
    }
  })
}

/**
 * Generates cURL and Python API execution snippets for CI/CD automation
 */
export function generateSnippets(plan, baseUrl = window.location.origin) {
  const planPayload = JSON.stringify(plan, null, 2)
  const curl = `curl -X POST "${baseUrl}/api/load-test-plans/run-inline" \\
  -H "Content-Type: application/json" \\
  -d '${planPayload.replace(/'/g, "'\\''")}'`

  const python = `import requests

url = "${baseUrl}/api/load-test-plans/run-inline"
payload = ${planPayload}

response = requests.post(url, json=payload)
print("Plan execution started:", response.json())
`

  return { curl, python }
}
