import { groupOf, orderModels, quickRank, smartRank, spreadGroups, writesText } from './ai.service';
import { providerPresets } from './defaults';

describe('orderModels', () => {
  const filler = Array.from({ length: 450 }, (_, i) => `aihorde/model-${i}`);
  const ids = [
    'auto/best-fast',
    ...filler,
    'veo-free/veo-3',
    'hormachuelos/kimi-k3',
    'hormachuelos/claude-sonnet-4-6',
    'hormachuelos/claude-opus-4-8-xhigh',
    'hormachuelos/brand-new-model',
  ];

  it('puts preferred models first, in their order', () => {
    const out = orderModels(ids, ['hormachuelos/claude-sonnet-4-6', 'auto/best-fast']);
    expect(out.slice(0, 2)).toEqual(['hormachuelos/claude-sonnet-4-6', 'auto/best-fast']);
  });

  it('checks every model of a preferred prefix before the rest, so newly added models are found', () => {
    const out = orderModels(ids, ['hormachuelos/claude-sonnet-4-6'], ['hormachuelos/']);
    const firstEight = out.slice(0, 8);
    expect(firstEight).toContain('hormachuelos/brand-new-model');
    expect(firstEight).toContain('hormachuelos/kimi-k3');
    expect(out.indexOf('hormachuelos/claude-opus-4-8-xhigh')).toBeGreaterThan(out.indexOf('hormachuelos/brand-new-model'));
  });

  it('leaves out models that cannot chat', () => {
    expect(orderModels(ids, [])).not.toContain('veo-free/veo-3');
  });

  it('skips favourites the server does not have', () => {
    expect(orderModels(['a/one'], ['gone/model'])).toEqual(['a/one']);
  });
});

describe('built-in preset', () => {
  it('prefers the gateway models that exist today', () => {
    const free = providerPresets.find((p) => p.key === 'free')!;
    expect(free.preferred[0]).toBe('hormachuelos/claude-sonnet-4-6');
    expect(free.preferPrefixes).toContain('hormachuelos/');
    expect(free.preferred.some((m) => m.startsWith('antigravity/'))).toBe(false);
  });

  it('checks the other free providers that work too', () => {
    const free = providerPresets.find((p) => p.key === 'free')!;
    expect(free.preferPrefixes).toEqual(expect.arrayContaining(['ddgw/', 'auto/']));
    expect(free.preferred).toContain('ddgw/gpt-5.6-luna');
  });

  it('puts smart models before small ones from the same provider', () => {
    const out = orderModels(['ddgw/gpt-5.4-mini', 'ddgw/claude-haiku-4-5', 'ddgw/gpt-5.6-luna', 'ddgw/claude-opus-4-8-xhigh'], [], ['ddgw/']);
    expect(out[0]).toBe('ddgw/gpt-5.6-luna');
    expect(out[out.length - 1]).toBe('ddgw/claude-opus-4-8-xhigh');
  });

  it('ranks the newest large models as smart', () => {
    expect(smartRank('hormachuelos/gpt-6.1-sol')).toBeLessThanOrEqual(1);
    expect(smartRank('hormachuelos/grok-4.7')).toBeLessThanOrEqual(1);
    expect(smartRank('hormachuelos/claude-fable-5-2')).toBeLessThanOrEqual(1);
  });
});

describe('spreadGroups', () => {
  it('takes turns between groups and keeps the order inside each group', () => {
    expect(spreadGroups(['h/a1', 'h/a2', 'h/a3', 'd/b1', 'c/c1', 'd/b2'])).toEqual(['h/a1', 'd/b1', 'c/c1', 'h/a2', 'd/b2', 'h/a3']);
  });

  it('knows the group of a model', () => {
    expect(groupOf('hormachuelos/claude-sonnet-4-6')).toBe('hormachuelos');
    expect(groupOf('no-think/hormachuelos/claude-sonnet-4-6')).toBe('no-think/hormachuelos');
    expect(groupOf('gemini-2.5-flash')).toBe('gemini-2.5-flash');
  });
});

describe('writesText', () => {
  it('leaves out image, video and audio models', () => {
    expect(writesText({ type: 'image', output_modalities: ['image'] })).toBe(false);
    expect(writesText({ type: 'video', output_modalities: ['video'] })).toBe(false);
    expect(writesText({ output_modalities: ['audio'] })).toBe(false);
    expect(writesText({ output_modalities: ['text'] })).toBe(true);
    expect(writesText({})).toBe(true);
  });
});


describe('quickRank', () => {
  it('picks a fast good model over a slow top model', () => {
    const slowTop = { model: 'hormachuelos/claude-sonnet-4-6', latency: 14 };
    const fastGood = { model: 'antigravity/gemini-3-flash', latency: 1.1 };
    expect(quickRank(fastGood)).toBeLessThan(quickRank(slowTop));
  });

  it('still picks the smarter model when both are fast', () => {
    expect(quickRank({ model: 'antigravity/claude-sonnet-4-6', latency: 1.4 })).toBeLessThan(quickRank({ model: 'ddgw/gpt-5.4-mini', latency: 1 }));
  });
});
