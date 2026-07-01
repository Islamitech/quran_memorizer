export class InteractiveTour {
  constructor() {
    this.steps = [];
    this.currentStep = -1;
    this.isActive = false;
    this.overlay = null;
    this.highlightBox = null;
    this.tooltip = null;
    
    this.init();
  }
  
  init() {
    this.createOverlay();
    this.createHighlightBox();
    this.createTooltip();
    document.addEventListener('keydown', this.handleKeyboard.bind(this));
  }
  
  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'tour-overlay';
    this.overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.7); z-index: 9999;
      display: none; pointer-events: none;
    `;
    document.body.appendChild(this.overlay);
  }
  
  createHighlightBox() {
    this.highlightBox = document.createElement('div');
    this.highlightBox.className = 'tour-highlight';
    this.highlightBox.style.cssText = `
      position: fixed; border-radius: 12px;
      box-shadow: 0 0 0 2px #4CAF50, 0 0 30px rgba(76, 175, 80, 0.3);
      z-index: 10000; pointer-events: none;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      display: none;
    `;
    document.body.appendChild(this.highlightBox);
  }
  
  createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tour-tooltip';
    this.tooltip.style.cssText = `
      position: fixed; background: #1a1a2e; color: #fff;
      padding: 20px; border-radius: 12px; max-width: 320px;
      z-index: 10001; box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      display: none; pointer-events: auto; font-family: 'Tajawal', sans-serif;
    `;
    
    this.tooltip.innerHTML = `
      <div class="tour-content"></div>
      <div class="tour-controls" style="display:flex; justify-content: space-between; margin-top: 15px;">
        <button class="tour-prev" style="background:#4CAF50; border:none; color:white; padding:5px 10px; border-radius:4px; cursor:pointer;">السابق</button>
        <span class="tour-counter"></span>
        <button class="tour-next" style="background:#4CAF50; border:none; color:white; padding:5px 10px; border-radius:4px; cursor:pointer;">التالي</button>
        <button class="tour-close" style="background:transparent; border:none; color:#f44336; cursor:pointer;">✕</button>
      </div>
    `;
    
    document.body.appendChild(this.tooltip);
    
    this.tooltip.querySelector('.tour-prev').addEventListener('click', () => this.prev());
    this.tooltip.querySelector('.tour-next').addEventListener('click', () => this.next());
    this.tooltip.querySelector('.tour-close').addEventListener('click', () => this.end());
  }
  
  defineSteps(steps) {
    this.steps = steps.map((step, index) => ({
      ...step,
      id: index,
      element: typeof step.target === 'string' 
        ? document.querySelector(step.target) 
        : step.target
    }));
  }
  
  start() {
    if (this.steps.length === 0) return;
    this.isActive = true;
    this.currentStep = 0;
    this.overlay.style.display = 'block';
    this.highlightBox.style.display = 'block';
    this.showStep(0);
  }
  
  showStep(index) {
    if (index < 0 || index >= this.steps.length) {
      this.end();
      return;
    }
    const step = this.steps[index];
    if (typeof step.target === 'string') {
        step.element = document.querySelector(step.target);
    }
    if (!step || !step.element) return;
    
    this.currentStep = index;
    
    // Scroll element into view safely before highlighting
    step.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    setTimeout(() => {
      this.updateHighlight(step.element);
      this.updateTooltip(step);
      this.updateCounter(index);
    }, 300);
    if (step.onEnter) step.onEnter();
  }
  
  updateHighlight(element) {
    const rect = element.getBoundingClientRect();
    const padding = 10;
    this.highlightBox.style.left = `${rect.left - padding}px`;
    this.highlightBox.style.top = `${rect.top - padding}px`;
    this.highlightBox.style.width = `${rect.width + padding * 2}px`;
    this.highlightBox.style.height = `${rect.height + padding * 2}px`;
  }
  
  updateTooltip(step) {
    const content = this.tooltip.querySelector('.tour-content');
    content.innerHTML = `
      <h3 style="font-size: 18px; margin: 0 0 8px;">${step.title}</h3>
      <p style="margin: 0; line-height: 1.6; opacity: 0.9;">${step.description}</p>
    `;
    
    const elementRect = step.element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let top, left;
    const tooltipWidth = 320;
    const tooltipHeight = 180;
    const gap = 20;
    
    if (elementRect.bottom + gap + tooltipHeight < viewportHeight) {
      top = elementRect.bottom + gap;
      left = Math.min(Math.max(elementRect.left + elementRect.width/2 - tooltipWidth/2, 10), viewportWidth - tooltipWidth - 10);
    } else if (elementRect.top - gap - tooltipHeight > 0) {
      top = elementRect.top - gap - tooltipHeight;
      left = Math.min(Math.max(elementRect.left + elementRect.width/2 - tooltipWidth/2, 10), viewportWidth - tooltipWidth - 10);
    } else {
      top = viewportHeight/2 - tooltipHeight/2;
      left = viewportWidth/2 - tooltipWidth/2;
    }
    
    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.display = 'block';
  }
  
  next() {
    if (this.currentStep < this.steps.length - 1) {
      const currentStep = this.steps[this.currentStep];
      if (currentStep.onExit) currentStep.onExit();
      this.showStep(this.currentStep + 1);
    } else {
      this.end();
    }
  }
  
  prev() {
    if (this.currentStep > 0) {
      this.showStep(this.currentStep - 1);
    }
  }
  
  end() {
    this.isActive = false;
    this.overlay.style.display = 'none';
    this.highlightBox.style.display = 'none';
    this.tooltip.style.display = 'none';
  }
  
  handleKeyboard(event) {
    if (!this.isActive) return;
    switch(event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault(); this.next(); break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault(); this.prev(); break;
      case 'Escape':
        event.preventDefault(); this.end(); break;
    }
  }
  
  updateCounter(index) {
    const counter = this.tooltip.querySelector('.tour-counter');
    if (counter) counter.textContent = `${index + 1}/${this.steps.length}`;
  }
}
