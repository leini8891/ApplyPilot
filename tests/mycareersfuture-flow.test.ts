// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  detectMcfFlowStage,
  findPrimaryMcfFlowAction,
} from '../apps/extension/src/content/mycareersfuture-flow';

const setStepMarkup = (stage: 'resume' | 'review' | 'success') => {
  if (stage === 'resume') {
    document.body.innerHTML = `
      <main>
        <section data-top="80" data-left="40">
          <h1 data-top="90" data-left="40">Demo Candidate applying for Data Analyst</h1>
          <div data-top="120" data-left="40">Step 1 of 3: Upload resume</div>
          <div data-top="200" data-left="40">Select an existing resume</div>
          <label data-top="260" data-left="40">demo-candidate.pdf</label>
          <button type="button" data-top="700" data-left="1100">Next, review application</button>
        </section>
      </main>
    `;

    document.querySelector('button')?.addEventListener('click', () => {
      setStepMarkup('review');
    });
    return;
  }

  if (stage === 'review') {
    document.body.innerHTML = `
      <main>
        <section data-top="80" data-left="40">
          <h1 data-top="90" data-left="40">Data Analyst</h1>
          <div data-top="120" data-left="40">Step 2 of 2: Review application</div>
          <a href="#" data-top="200" data-left="1200">Change</a>
          <button type="button" data-top="760" data-left="1120">Submit</button>
        </section>
      </main>
    `;

    document.querySelector('button')?.addEventListener('click', () => {
      setStepMarkup('success');
    });
    return;
  }

  document.body.innerHTML = `
    <main>
      <section data-top="80" data-left="40">
        <h1 data-top="90" data-left="40">Application submitted</h1>
        <div data-top="140" data-left="40">Your application has been sent successfully.</div>
        <button type="button" data-top="760" data-left="1120">Done</button>
      </section>
    </main>
  `;
};

describe('mycareersfuture flow helper', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        const top = Number((this as HTMLElement).dataset.top ?? 100);
        const left = Number((this as HTMLElement).dataset.left ?? 100);

        return {
          x: left,
          y: top,
          top,
          left,
          width: 180,
          height: 48,
          right: left + 180,
          bottom: top + 48,
          toJSON() {
            return {};
          },
        };
      },
    });
  });

  it('selects the correct primary action at each step', () => {
    setStepMarkup('resume');
    expect(detectMcfFlowStage(document.body)).toBe('resume');
    expect(findPrimaryMcfFlowAction(document.body)?.label).toBe('next, review application');

    setStepMarkup('review');
    expect(detectMcfFlowStage(document.body)).toBe('review');
    expect(findPrimaryMcfFlowAction(document.body)?.label).toBe('submit');

    setStepMarkup('success');
    expect(detectMcfFlowStage(document.body)).toBe('success');
    expect(findPrimaryMcfFlowAction(document.body)?.label).toBe('done');
  });

  it('can drive a mocked MCF flow from resume step to success', () => {
    setStepMarkup('resume');

    for (let step = 0; step < 3; step += 1) {
      const action = findPrimaryMcfFlowAction(document.body);
      expect(action).not.toBeNull();
      action?.button.click();
    }

    expect(detectMcfFlowStage(document.body)).toBe('success');
    expect(document.body.textContent).toContain('Your application has been sent successfully.');
  });
});
