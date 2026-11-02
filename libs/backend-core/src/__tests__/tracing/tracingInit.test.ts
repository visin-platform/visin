/**
 * The OpenTelemetry provider and exporter are mocked out: this file checks the
 * module's own decisions (sampling ratio, whether there is an exporter, what
 * identifies the service). tracing.test.ts runs the real SDK end to end.
 */
const registerMock = jest.fn();
const getTracerMock = jest.fn((name: string) => ({ tracerFor: name }));
const providerCtorMock = jest.fn().mockImplementation((options: unknown) => ({
  __options: options,
  register: registerMock,
  getTracer: getTracerMock
}));
const exporterCtorMock = jest.fn().mockImplementation((options: unknown) => ({ __exporter: options }));
const batchCtorMock = jest.fn().mockImplementation((exporter: unknown) => ({ __batch: exporter }));
const parentBasedCtorMock = jest.fn().mockImplementation((options: unknown) => ({ __parentBased: options }));
const ratioCtorMock = jest.fn().mockImplementation((ratio: number) => ({ __ratio: ratio }));

jest.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: providerCtorMock,
  BatchSpanProcessor: batchCtorMock,
  ParentBasedSampler: parentBasedCtorMock,
  TraceIdRatioBasedSampler: ratioCtorMock
}));
jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter: exporterCtorMock }));
jest.mock('@opentelemetry/resources', () => ({ resourceFromAttributes: (attributes: unknown) => attributes }));

const ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV };
  delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  delete process.env.OTEL_TRACES_SAMPLER_ARG;
  delete process.env.SERVICE_NAME;
});

afterAll(() => {
  process.env = ENV;
});

async function load() {
  let tracing!: typeof import('../../tracing');
  await jest.isolateModulesAsync(async () => {
    tracing = await import('../../tracing');
  });
  return tracing;
}

describe('sampleRatio', () => {
  it.each([
    [undefined, 0.1],
    ['', 0.1],
    ['  ', 0.1],
    ['0', 0],
    ['0.25', 0.25],
    ['1', 1],
    ['2', 0.1],
    ['-1', 0.1],
    ['often', 0.1]
  ])('reads %p as %p', async (raw, expected) => {
    const { sampleRatio } = await load();

    expect(sampleRatio({ OTEL_TRACES_SAMPLER_ARG: raw } as NodeJS.ProcessEnv)).toBe(expected);
  });

  it('reads the process environment by default', async () => {
    process.env.OTEL_TRACES_SAMPLER_ARG = '0.5';
    const { sampleRatio } = await load();

    expect(sampleRatio()).toBe(0.5);
  });
});

describe('initTracer', () => {
  it('has no exporter when no endpoint is set, so nothing is ever sent', async () => {
    const { initTracer } = await load();

    initTracer('auth-service');

    expect(exporterCtorMock).not.toHaveBeenCalled();
    expect(providerCtorMock.mock.calls[0][0].spanProcessors).toEqual([]);
    expect(registerMock).toHaveBeenCalledTimes(1);
  });

  it('exports in batches over OTLP/HTTP to the endpoint', async () => {
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://jaeger:4318/v1/traces';
    const { initTracer } = await load();

    initTracer('auth-service');

    expect(exporterCtorMock).toHaveBeenCalledWith({ url: 'http://jaeger:4318/v1/traces' });
    expect(providerCtorMock.mock.calls[0][0].spanProcessors).toHaveLength(1);
  });

  it('keeps a trace whole by following the caller, and samples only the roots', async () => {
    process.env.OTEL_TRACES_SAMPLER_ARG = '0.5';
    const { initTracer } = await load();

    initTracer('auth-service');

    expect(ratioCtorMock).toHaveBeenCalledWith(0.5);
    expect(parentBasedCtorMock).toHaveBeenCalledWith({ root: { __ratio: 0.5 } });
  });

  it('names the service and the environment', async () => {
    process.env.NODE_ENV = 'production';
    const { initTracer } = await load();

    initTracer('vision-service');

    expect(providerCtorMock.mock.calls[0][0].resource).toMatchObject({
      'service.name': 'vision-service',
      'deployment.environment': 'production'
    });
    expect(getTracerMock).toHaveBeenCalledWith('vision-service');
  });

  it('falls back to a development environment and an unknown version', async () => {
    delete process.env.NODE_ENV;
    delete process.env.npm_package_version;
    const { initTracer } = await load();

    initTracer('vision-service');

    expect(providerCtorMock.mock.calls[0][0].resource).toMatchObject({
      'service.version': '0.0.0',
      'deployment.environment': 'development'
    });
  });
});

describe('getTracer', () => {
  it('is created once, named after SERVICE_NAME', async () => {
    process.env.SERVICE_NAME = 'label-service';
    const { getTracer } = await load();

    expect(getTracer()).toBe(getTracer());
    expect(providerCtorMock).toHaveBeenCalledTimes(1);
    expect(getTracerMock).toHaveBeenCalledWith('label-service');
  });

  it('is called unknown-service when SERVICE_NAME is not set', async () => {
    const { getTracer } = await load();

    getTracer();

    expect(getTracerMock).toHaveBeenCalledWith('unknown-service');
  });
});
