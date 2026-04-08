var allData = [];
var showAll = false;
var simulationSummary = {
  retirementSnapshot: null,
  limitWarnings: [],
  limitSettings: {
    celi: true,
    reer: true
  }
};

var assistantState = {
  stepIndex: 0,
  collected: {},
  complete: false,
  busy: false,
  askedQuestions: [],
  started: false,
  waitingStartConsent: true,
  restartMode: false
};

var assistantScheduledTimers = [];

var assistantBaseSteps = [
  { field: 'currentAge', label: 'Quel âge as-tu aujourd’hui ?', type: 'number', placeholder: '62' },
  { field: 'retirementAge', label: 'À quel âge veux-tu prendre ta retraite ?', type: 'number', placeholder: '65' },
  { field: 'endAge', label: 'Quelle espérance de vie veux-tu utiliser ?', type: 'number', placeholder: '90' },
  { field: 'celiInitialAmount', label: 'Quel montant as-tu actuellement dans ton CELI ?', type: 'number', placeholder: '2000' },
  { field: 'reerInitialAmount', label: 'Quel montant as-tu actuellement dans ton REER ?', type: 'number', placeholder: '2000' },
  { field: 'nonRegInitialAmount', label: 'Quel montant as-tu actuellement dans ton compte non enregistré ?', type: 'number', placeholder: '1000' },
  { field: 'celiAnnualContrib', label: 'Quel montant veux-tu cotiser chaque année dans le CELI ?', type: 'number', placeholder: '3000' },
  { field: 'reerAnnualContrib', label: 'Quel montant veux-tu cotiser chaque année dans le REER ?', type: 'number', placeholder: '2000' },
  { field: 'nonRegAnnualContrib', label: 'Quel montant veux-tu cotiser chaque année dans le compte non enregistré ?', type: 'number', placeholder: '1000' },
  { field: 'contribGrowth', label: 'De combien veux-tu augmenter tes cotisations chaque année ?', type: 'number', placeholder: '2' },
  { field: 'annualWithdrawal', label: 'Quel retrait annuel souhaites-tu à la retraite ?', type: 'number', placeholder: '36000' },
  { field: 'growthRate', label: 'Quel rendement annuel veux-tu jusqu\'à ta retraite ?', type: 'number', placeholder: '3.5' },
  { field: 'retirGrowthRate', label: 'Quel rendement annuel veux-tu à la retraite ?', type: 'number', placeholder: '2.5' },
  { field: 'inflation', label: 'Quelle elle le pourcentage d\'inflation annuelle que tu prévoit durant ta retraite (pour indexer tes retraits) ?', type: 'number', placeholder: '2' },
  { field: 'celiLimitMode', label: 'Veux-tu appliquer les limites de cotisation CELI ?', type: 'choice', choices: ['yes', 'no'], placeholder: 'non' },
  { field: 'reerLimitMode', label: 'Veux-tu appliquer les limites de cotisation REER ?', type: 'choice', choices: ['yes', 'no'], placeholder: 'non' },
  { field: 'rrqBase', label: 'Quel est le montant de ta rente de base RRQ (par année) ?', type: 'number', placeholder: '10125' },
  { field: 'rrqAge', label: 'À quel âge veux-tu commencer la RRQ ?', type: 'number', placeholder: '65' },
  { field: 'psvBase', label: 'Quel est le montant de la PSV (par année) ?', type: 'number', placeholder: '8727' },
  { field: 'psvYears', label: 'Combien d’années au Canada après tes 18 ans auras-tu vécu au moment de prendre ta PSV ?', type: 'number', placeholder: '40' },
  { field: 'psvAge', label: 'À quel âge veux-tu commencer la PSV ?', type: 'number', placeholder: '65' }
];

var assistantConditionalStepGroups = {
  celiLimitMode: [
    { field: 'celiRoomAvailable', label: 'Quels sont les droits de cotisation disponibles pour ton CELI ?', type: 'number', placeholder: '10000' },
    { field: 'celiAnnualLimit', label: 'Quelle est la limite de cotisation annuelle pour ton CELI ?', type: 'number', placeholder: '7000' }
  ],
  reerLimitMode: [
    { field: 'reerIncome', label: 'Quel est ton revenu annuel brut ?', type: 'number', placeholder: '70000' },
    { field: 'reerRoomAvailable', label: 'Quels sont les droits de cotisations disponibles pour ton REER ?', type: 'number', placeholder: '15000' },
    { field: 'reerRoomRate', label: 'Quel est le taux de droit de cotisation en vigueur pour ton REER ?', type: 'number', placeholder: '18' },
    { field: 'reerAnnualCap', label: 'Quel est le montant du plafond annuel en vigueur pour ton REER ?', type: 'number', placeholder: '33000' }
  ]
};

var assistantSteps = assistantBaseSteps.slice();

var assistantElements = {
  root: null,
  kicker: null,
  chat: null,
  input: null,
  sendButton: null,
  applyButton: null,
  toggleButton: null
};

var assistantTypingElement = null;
var assistantFooterSpaceTimer = null;
var assistantResizeBound = false;

function assistantIsMobileLayout() {
  return window.matchMedia('(max-width: 1100px)').matches;
}

function assistantUpdateFooterSafeSpace() {
  var rootEl = document.documentElement;
  if (!rootEl || !assistantElements.root) return;

  if (!assistantIsMobileLayout()) {
    rootEl.style.setProperty('--assistant-footer-safe-space', '0px');
    return;
  }

  var isCollapsed = assistantElements.root.classList.contains('is-collapsed');
  var safeSpace = 18;

  if (isCollapsed && assistantElements.toggleButton) {
    var btnHeight = Math.ceil(assistantElements.toggleButton.getBoundingClientRect().height || 60);
    safeSpace = btnHeight + 28;
  }

  rootEl.style.setProperty('--assistant-footer-safe-space', safeSpace + 'px');
}

function assistantSetCollapsed(isCollapsed) {
  if (!assistantElements.root || !assistantElements.toggleButton) return;
  assistantElements.root.classList.toggle('is-collapsed', isCollapsed);
  assistantElements.toggleButton.setAttribute('aria-expanded', String(!isCollapsed));
  assistantElements.toggleButton.textContent = isCollapsed ? 'Ouvrir' : 'Réduire';
  assistantUpdateFooterSafeSpace();
  if (assistantFooterSpaceTimer) clearTimeout(assistantFooterSpaceTimer);
  assistantFooterSpaceTimer = setTimeout(assistantUpdateFooterSafeSpace, 360);
}

function assistantFieldLabel(field) {
  var step = null;
  for (var i = 0; i < assistantSteps.length; i++) {
    if (assistantSteps[i].field === field) {
      step = assistantSteps[i];
      break;
    }
  }
  return step ? step.label : field;
}

function assistantCurrentStep() {
  return assistantSteps[assistantState.stepIndex] || null;
}

function assistantResetStepFlow() {
  assistantSteps = assistantBaseSteps.slice();
}

function assistantRemoveStepsByFields(fields) {
  if (!fields || !fields.length) return;
  assistantSteps = assistantSteps.filter(function(step) {
    return fields.indexOf(step.field) === -1;
  });
}

function assistantInsertStepsAfterField(afterField, newSteps) {
  if (!newSteps || !newSteps.length) return;
  var index = -1;
  for (var i = 0; i < assistantSteps.length; i++) {
    if (assistantSteps[i].field === afterField) {
      index = i;
      break;
    }
  }
  if (index === -1) return;

  var before = assistantSteps.slice(0, index + 1);
  var after = assistantSteps.slice(index + 1);
  assistantSteps = before.concat(newSteps, after);
}

function assistantConfigureConditionalSteps(choiceField, choiceValue) {
  var group = assistantConditionalStepGroups[choiceField];
  if (!group) return;

  var fields = group.map(function(step) { return step.field; });
  assistantRemoveStepsByFields(fields);

  if (choiceValue === 'yes') {
    assistantInsertStepsAfterField(choiceField, group);
    return;
  }

  for (var i = 0; i < fields.length; i++) {
    delete assistantState.collected[fields[i]];
  }
}

function assistantQuestionForStep(step) {
  return step ? step.label : '';
}

function assistantTrackAskedQuestion(question) {
  if (!question) return;
  assistantState.askedQuestions.push(question);
  if (assistantState.askedQuestions.length > 25) {
    assistantState.askedQuestions.shift();
  }
}

function assistantAskStepQuestion(step, forcedQuestion) {
  if (!step) return;
  var questionText = (forcedQuestion && String(forcedQuestion).trim()) || assistantQuestionForStep(step);
  assistantAppendBotMessageWithTyping(questionText, false, 520);
  assistantTrackAskedQuestion(questionText);
}

function assistantSetBusy(isBusy) {
  assistantState.busy = isBusy;
  if (assistantElements.sendButton) assistantElements.sendButton.disabled = isBusy;
  if (assistantElements.input) assistantElements.input.disabled = isBusy;
}

function assistantSetSimulationButtonVisibility(isVisible) {
  if (!assistantElements.applyButton) return;
  assistantElements.applyButton.classList.toggle('is-hidden', !isVisible);
}

function assistantSetSimulationButtonReady(isReady) {
  if (!assistantElements.applyButton) return;
  assistantElements.applyButton.disabled = !isReady;
  assistantElements.applyButton.classList.toggle('is-ready', isReady);
}

function assistantSetPrimaryButtonMode(mode) {
  if (!assistantElements.applyButton) return;
  if (mode === 'restart') {
    assistantElements.applyButton.textContent = 'RECOMMENCER DEPUIS LE DEBUT';
    assistantElements.applyButton.classList.add('is-restart');
    return;
  }
  assistantElements.applyButton.textContent = 'SIMULER MA RETRAITE';
  assistantElements.applyButton.classList.remove('is-restart');
}

function assistantSetTimer(callback, delayMs) {
  var timerId = setTimeout(function() {
    var idx = assistantScheduledTimers.indexOf(timerId);
    if (idx !== -1) assistantScheduledTimers.splice(idx, 1);
    callback();
  }, delayMs);
  assistantScheduledTimers.push(timerId);
  return timerId;
}

function assistantClearTimers() {
  while (assistantScheduledTimers.length) {
    clearTimeout(assistantScheduledTimers.pop());
  }
}

function assistantScrollToBottom() {
  if (!assistantElements.chat) return;
  assistantElements.chat.scrollTop = assistantElements.chat.scrollHeight;
}

function assistantAppendMessage(role, label, text, allowHtml, extraClass) {
  if (!assistantElements.chat) return;
  var message = document.createElement('div');
  message.className = 'ai-message ' + (role === 'user' ? 'ai-message-user' : 'ai-message-bot');
  if (extraClass) message.classList.add(extraClass);
  var labelEl = document.createElement('div');
  labelEl.className = 'ai-message-label';
  labelEl.textContent = label;

  var bubbleEl = document.createElement('div');
  bubbleEl.className = 'ai-message-bubble';
  if (allowHtml) bubbleEl.innerHTML = text;
  else bubbleEl.textContent = text;

  message.appendChild(labelEl);
  message.appendChild(bubbleEl);
  assistantElements.chat.appendChild(message);
  assistantScrollToBottom();
}

function assistantShowTyping() {
  if (!assistantElements.chat || assistantTypingElement) return;
  var message = document.createElement('div');
  message.className = 'ai-message ai-message-bot ai-message-typing';

  var labelEl = document.createElement('div');
  labelEl.className = 'ai-message-label';
  labelEl.textContent = 'Assistant';

  var bubbleEl = document.createElement('div');
  bubbleEl.className = 'ai-message-bubble';
  bubbleEl.innerHTML = '<span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span>';

  message.appendChild(labelEl);
  message.appendChild(bubbleEl);
  assistantElements.chat.appendChild(message);
  assistantTypingElement = message;
  assistantScrollToBottom();
}

function assistantHideTyping() {
  if (!assistantTypingElement) return;
  if (assistantTypingElement.parentNode) {
    assistantTypingElement.parentNode.removeChild(assistantTypingElement);
  }
  assistantTypingElement = null;
}

function assistantSetInputPrompt(step) {
  if (!assistantElements.input) return;
  assistantElements.input.value = '';
  assistantElements.input.placeholder = step ? step.placeholder ? 'Ex: ' + step.placeholder : 'Répondre ici...' : 'Répondre ici...';
}

function assistantLooksLikeQuestion(text) {
  var value = String(text || '').trim().toLowerCase();
  if (!value) return false;
  if (value.indexOf('?') !== -1) return true;
  return /^(pourquoi|comment|peux-tu|peux tu|est-ce|c'est quoi|cest quoi|quelle|quand|combien|a quoi sert|ça sert a quoi)/.test(value);
}

function assistantBuildQuestionFallback(step) {
  var currentQuestion = step ? assistantQuestionForStep(step) : 'la question actuelle';
  return 'Bonne question. Je peux t’aider sur le sens des champs et la façon de répondre. On reprend: ' + currentQuestion;
}

function assistantSetConsentPrompt() {
  if (!assistantElements.input) return;
  assistantElements.input.value = '';
  assistantElements.input.placeholder = 'Réponds Oui ou Non';
}

function assistantAppendBotMessageWithTyping(text, allowHtml, delayMs) {
  var typingDelay = typeof delayMs === 'number' ? delayMs : 520;
  assistantShowTyping();
  assistantSetTimer(function() {
    assistantHideTyping();
    assistantAppendMessage('bot', 'Assistant', text, allowHtml);
  }, typingDelay);
}

function assistantResetSession(showRestartNotice) {
  if (!assistantElements.chat) return;

  assistantClearTimers();
  assistantElements.chat.innerHTML = '';
  assistantResetStepFlow();
  assistantState.stepIndex = 0;
  assistantState.collected = {};
  assistantState.complete = false;
  assistantState.busy = false;
  assistantState.askedQuestions = [];
  assistantState.started = false;
  assistantState.waitingStartConsent = true;
  assistantState.restartMode = false;
  assistantHideTyping();
  assistantSetBusy(false);

  assistantSetPrimaryButtonMode('simulate');
  assistantSetSimulationButtonVisibility(false);
  assistantSetSimulationButtonReady(false);

  if (showRestartNotice) {
    assistantAppendMessage('bot', 'Assistant', 'Nouveau questionnaire démarré. On repart depuis le début.', false, 'ai-message-info');
  }

  assistantAppendBotMessageWithTyping('Bonjour. Je peux remplir le formulaire retraite avec toi, question par question.', false, 380);
  assistantSetTimer(function() {
    assistantAppendBotMessageWithTyping('Veux-tu commencer le remplissage du formulaire ?', false, 420);
  }, 420);

  assistantSetConsentPrompt();
  assistantUpdateFooterSafeSpace();
}

function assistantNormalizeChoice(value) {
  var normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'oui' || normalized === 'yes' || normalized === 'y' || normalized === 'oui.') return 'yes';
  if (normalized === 'non' || normalized === 'no' || normalized === 'n' || normalized === 'non.') return 'no';
  return null;
}

function assistantParseStepValue(step, rawValue) {
  if (step.type === 'choice') {
    var choice = assistantNormalizeChoice(rawValue);
    return choice ? { ok: true, value: choice } : { ok: false, error: 'Réponds par Oui ou Non.' };
  }

  var parsed = parseLocaleNumber(rawValue);
  if (isNaN(parsed)) {
    return { ok: false, error: 'Je n’ai pas compris le nombre. Essaie avec un chiffre simple.' };
  }

  if (step.field === 'currentAge') {
    parsed = Math.round(parsed);
  } else if (step.field === 'retirementAge') {
    parsed = Math.round(parsed);
  } else if (step.field === 'endAge') {
    parsed = Math.round(parsed);
  } else if (step.field === 'rrqAge' || step.field === 'psvAge' || step.field === 'psvYears') {
    parsed = Math.round(parsed);
  }

  return { ok: true, value: parsed };
}

function assistantBuildReply(step, value) {
  if (step.type === 'choice') {
    return 'C’est noté. ' + assistantFieldLabel(step.field) + ' = ' + (value === 'yes' ? 'Oui' : 'Non') + '.';
  }
  return 'C’est noté. ' + assistantFieldLabel(step.field) + ' = ' + value + '.';
}

function assistantBuildSummary() {
  var parts = [];
  for (var i = 0; i < assistantSteps.length; i++) {
    var step = assistantSteps[i];
    if (assistantState.collected[step.field] != null) {
      var value = assistantState.collected[step.field];
      parts.push('<strong>' + assistantFieldLabel(step.field) + ':</strong> ' + (step.type === 'choice' ? (value === 'yes' ? 'Oui' : 'Non') : value));
    }
  }
  return parts.join('<br>');
}

function assistantApplyCollectedValues() {
  var keys = Object.keys(assistantState.collected);
  for (var i = 0; i < keys.length; i++) {
    var field = keys[i];
    var value = assistantState.collected[field];
    var input = document.getElementById(field);

    if (input && input.type === 'text') {
      input.value = value;
      formatNumericInput(input);
      continue;
    }

    if (field === 'celiLimitMode' || field === 'reerLimitMode') {
      var radio = document.querySelector('input[name="' + field + '"][value="' + value + '"]');
      if (radio) radio.checked = true;
    }
  }

  syncLimitFieldsVisibility();
  updateRrq();
  updatePsv();
  calculate(true);
}

async function assistantHandleAnswer(rawValue) {
  if (assistantState.busy) return;

  var trimmedValue = String(rawValue || '').trim();
  if (!trimmedValue) return;

  assistantAppendMessage('user', 'Toi', trimmedValue);

  if (assistantState.waitingStartConsent) {
    var consent = assistantNormalizeChoice(trimmedValue);
    if (!consent) {
      assistantAppendBotMessageWithTyping('Je veux m’assurer que tu es prêt. Réponds simplement par Oui ou Non.', false, 420);
      assistantSetConsentPrompt();
      return;
    }

    if (consent === 'no') {
      assistantAppendBotMessageWithTyping('Aucun souci. Quand tu veux commencer, réponds Oui et je lance le questionnaire.', false, 420);
      assistantSetConsentPrompt();
      return;
    }

    assistantState.waitingStartConsent = false;
    assistantState.started = true;
    assistantAppendBotMessageWithTyping('Ok super, allons-y.', false, 360);

    var consentFirstStep = assistantCurrentStep();
    assistantSetInputPrompt(consentFirstStep);
    setTimeout(function() {
      assistantAskStepQuestion(consentFirstStep);
    }, 380);
    return;
  }

  var step = assistantCurrentStep();
  if (!step) return;

  if (assistantLooksLikeQuestion(trimmedValue)) {
    var questionReply = assistantBuildQuestionFallback(step);
    assistantAppendMessage('bot', 'Assistant', questionReply);
    assistantSetInputPrompt(step);
    assistantAskStepQuestion(step);
    return;
  }

  var parsed = assistantParseStepValue(step, trimmedValue);
  if (!parsed.ok) {
    assistantAppendMessage('bot', 'Assistant', parsed.error);
    assistantSetInputPrompt(step);
    return;
  }

  assistantState.collected[step.field] = parsed.value;

  if (step.type === 'choice') {
    assistantConfigureConditionalSteps(step.field, parsed.value);
  }

  var nextStepIndex = assistantState.stepIndex + 1;
  var replyText = assistantBuildReply(step, parsed.value);
  var completed = nextStepIndex >= assistantSteps.length;

  assistantAppendMessage('bot', 'Assistant', replyText);
  assistantState.stepIndex = nextStepIndex;

  if (completed) {
    assistantState.complete = true;
    if (assistantElements.input) assistantElements.input.value = '';
    assistantSetSimulationButtonVisibility(true);
    assistantSetSimulationButtonReady(true);
    assistantSetPrimaryButtonMode('simulate');
    assistantAppendBotMessageWithTyping('Parfait. Toutes les informations sont complètes. Clique sur « SIMULER MA RETRAITE » pour lancer la simulation.', false, 430);
    assistantSetTimer(function() {
      assistantAppendMessage('bot', 'Assistant', assistantBuildSummary(), true);
    }, 440);
    assistantSetBusy(true);
    if (assistantElements.input) assistantElements.input.placeholder = 'Questionnaire complété';
    return;
  }

  var nextStep = assistantCurrentStep();
  assistantSetInputPrompt(nextStep);
  assistantAskStepQuestion(nextStep);
}

function initAssistant() {
  assistantElements.root = document.querySelector('.ai-assistant');
  if (!assistantElements.root) return;

  assistantElements.kicker = assistantElements.root.querySelector('.ai-assistant-kicker');
  assistantElements.chat = assistantElements.root.querySelector('.ai-chat');
  assistantElements.input = assistantElements.root.querySelector('.ai-assistant-input input');
  assistantElements.sendButton = assistantElements.root.querySelector('.ai-assistant-input button');
  assistantElements.applyButton = assistantElements.root.querySelector('.ai-assistant-primary');
  assistantElements.toggleButton = assistantElements.root.querySelector('.ai-assistant-toggle');

  if (!assistantElements.chat || !assistantElements.input || !assistantElements.sendButton || !assistantElements.applyButton) return;
  assistantResetSession(false);

  if (assistantIsMobileLayout()) {
    assistantSetCollapsed(false);
  } else {
    assistantSetCollapsed(false);
  }

  if (assistantElements.toggleButton) {
    assistantElements.toggleButton.setAttribute('aria-label', 'Réduire ou ouvrir l’assistant');
    assistantElements.toggleButton.addEventListener('click', function() {
      assistantSetCollapsed(!assistantElements.root.classList.contains('is-collapsed'));
    });
  }

  if (!assistantResizeBound) {
    window.addEventListener('resize', assistantUpdateFooterSafeSpace);
    assistantResizeBound = true;
  }

  assistantElements.sendButton.addEventListener('click', function() {
    var value = assistantElements.input.value;
    if (!value || !value.trim()) return;
    assistantElements.input.value = '';
    assistantHandleAnswer(value);
  });

  assistantElements.input.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      assistantElements.sendButton.click();
    }
  });

  assistantElements.applyButton.addEventListener('click', function() {
    if (assistantState.restartMode) {
      assistantResetSession(true);
      return;
    }
    if (!assistantState.complete) return;
    assistantApplyCollectedValues();
    assistantAppendMessage('bot', 'Assistant', 'Simulation lancée. Tu peux maintenant cliquer sur le bouton gris pour recommencer un nouveau remplissage.');
    assistantState.restartMode = true;
    assistantSetPrimaryButtonMode('restart');
    assistantSetSimulationButtonVisibility(true);
    assistantSetSimulationButtonReady(true);
  });

  assistantSetCollapsed(true);
  assistantUpdateFooterSafeSpace();
}

function getLimitMode(name) {
  var selected = document.querySelector('input[name="' + name + '"]:checked');
  return selected ? selected.value : 'yes';
}

function setLimitFieldsVisibility(panel, shouldShow, instant) {
  if (!panel) return;

  if (panel._limitTransitionEnd) {
    panel.removeEventListener('transitionend', panel._limitTransitionEnd);
    panel._limitTransitionEnd = null;
  }

  if (instant) {
    panel.classList.toggle('is-hidden', !shouldShow);
    panel.style.height = '';
    panel.style.opacity = '';
    panel.style.transform = '';
    panel.style.transition = '';
    panel.style.overflow = '';
    return;
  }

  panel.style.overflow = 'hidden';
  panel.style.transition = 'height 280ms ease, opacity 220ms ease, transform 280ms ease';

  if (shouldShow) {
    panel.classList.remove('is-hidden');
    panel.style.height = '0px';
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(-4px)';
    void panel.offsetHeight;

    panel.style.height = panel.scrollHeight + 'px';
    panel.style.opacity = '1';
    panel.style.transform = 'translateY(0)';

    panel._limitTransitionEnd = function(event) {
      if (event.propertyName !== 'height') return;
      panel.style.height = '';
      panel.style.opacity = '';
      panel.style.transform = '';
      panel.style.transition = '';
      panel.style.overflow = '';
      panel.removeEventListener('transitionend', panel._limitTransitionEnd);
      panel._limitTransitionEnd = null;
    };
    panel.addEventListener('transitionend', panel._limitTransitionEnd);
    return;
  }

  if (panel.classList.contains('is-hidden')) {
    panel.style.transition = '';
    panel.style.overflow = '';
    return;
  }

  panel.style.height = panel.scrollHeight + 'px';
  panel.style.opacity = '1';
  panel.style.transform = 'translateY(0)';
  void panel.offsetHeight;

  panel.style.height = '0px';
  panel.style.opacity = '0';
  panel.style.transform = 'translateY(-4px)';

  panel._limitTransitionEnd = function(event) {
    if (event.propertyName !== 'height') return;
    panel.classList.add('is-hidden');
    panel.style.height = '';
    panel.style.opacity = '';
    panel.style.transform = '';
    panel.style.transition = '';
    panel.style.overflow = '';
    panel.removeEventListener('transitionend', panel._limitTransitionEnd);
    panel._limitTransitionEnd = null;
  };
  panel.addEventListener('transitionend', panel._limitTransitionEnd);
}

function syncLimitFieldsVisibility(options) {
  var instant = !!(options && options.instant);
  var celiEnabled = getLimitMode('celiLimitMode') === 'yes';
  var reerEnabled = getLimitMode('reerLimitMode') === 'yes';

  var celiFields = document.getElementById('celiLimitFields');
  var reerFields = document.getElementById('reerLimitFields');

  setLimitFieldsVisibility(celiFields, celiEnabled, instant);
  setLimitFieldsVisibility(reerFields, reerEnabled, instant);
}

function initLimitControls() {
  var controls = document.querySelectorAll('input[name="celiLimitMode"], input[name="reerLimitMode"]');
  for (var i = 0; i < controls.length; i++) {
    controls[i].addEventListener('change', function() {
      syncLimitFieldsVisibility();
      var results = document.getElementById('results');
      if (results && results.style.display === 'block') {
        calculate();
      }
    });
  }
  syncLimitFieldsVisibility({ instant: true });
}

// Theme Management
function initTheme() {
  var savedTheme = localStorage.getItem('theme') || 'dark-mode';
  var systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme === 'auto') {
    savedTheme = systemPrefersDark ? 'dark-mode' : 'light-mode';
  }
  
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  var html = document.documentElement;
  html.classList.remove('dark-mode', 'light-mode');
  html.classList.add(theme);
  
  var toggle = document.getElementById('themeToggle');
  var label = document.getElementById('themeLabel');
  
  if (theme === 'light-mode') {
    toggle.classList.add('active');
    label.textContent = 'Clair';
  } else {
    toggle.classList.remove('active');
    label.textContent = 'Sombre';
  }
  
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  var html = document.documentElement;
  var newTheme = html.classList.contains('dark-mode') ? 'light-mode' : 'dark-mode';
  applyTheme(newTheme);
}

function parseLocaleNumber(value) {
  if (value == null) return NaN;
  var normalized = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .replace(',', '.');
  normalized = normalized.replace(/[^0-9.\-]/g, '');
  if (!normalized || normalized === '-' || normalized === '.') return NaN;

  var firstDot = normalized.indexOf('.');
  if (firstDot !== -1) {
    normalized = normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, '');
  }
  return parseFloat(normalized);
}

function getNumericValue(id, fallback) {
  var el = document.getElementById(id);
  if (!el) return fallback;
  var parsed = parseLocaleNumber(el.value);
  return isNaN(parsed) ? fallback : parsed;
}

function formatNumericInput(input) {
  if (!input) return;
  var isPercent = input.dataset.isPercent === '1';
  var parsed = parseLocaleNumber(input.value);
  if (isNaN(parsed)) parsed = 0;

  var formatted = isPercent
    ? parsed.toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : parsed.toLocaleString('fr-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  input.value = formatted;
}

function unformatNumericInput(input) {
  if (!input) return;
  var parsed = parseLocaleNumber(input.value);
  if (isNaN(parsed)) {
    input.value = '';
    return;
  }
  var isPercent = input.dataset.isPercent === '1';
  input.value = isPercent ? parsed.toFixed(1).replace('.', ',') : Math.round(parsed).toString();
}

function initNumericInputFormatting() {
  var inputs = document.querySelectorAll('input[type="text"][inputmode="decimal"]');
  for (var i = 0; i < inputs.length; i++) {
    (function(input) {
      var unitEl = input.parentElement ? input.parentElement.querySelector('.input-unit') : null;
      input.dataset.isPercent = unitEl && unitEl.textContent.indexOf('%') !== -1 ? '1' : '0';

      input.addEventListener('focus', function() {
        unformatNumericInput(input);
      });

      input.addEventListener('blur', function() {
        formatNumericInput(input);
      });

      input.addEventListener('input', function() {
        input.value = input.value.replace(/\./g, ',');
      });

      formatNumericInput(input);
    })(inputs[i]);
  }
}

function fmt(n) {
  if (n == null) return '--';
  var a = Math.abs(n);
  if (a >= 1e6) return (n/1e6).toFixed(2) + 'M$';
  if (a >= 1e3) return (n/1e3).toFixed(0) + 'k$';
  return n.toFixed(0) + '$';
}

function fmtFull(n) {
  return new Intl.NumberFormat('fr-CA', {style:'currency', currency:'CAD', maximumFractionDigits:0}).format(n);
}

function niceTickStep(maxValue, tickCount) {
  var rawStep = maxValue / tickCount;
  var magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  var normalized = rawStep / magnitude;

  var niceNormalized;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;

  return niceNormalized * magnitude;
}

function updateRrq() {
  var base = getNumericValue('rrqBase', 0);
  var age  = Math.round(getNumericValue('rrqAge', 65));
  var effectiveAge = Math.min(age, 72);
  var diff = effectiveAge - 65;
  var adjPct = diff < 0 ? diff * 7.2 : diff * 8.4;
  adjPct = Math.max(-100, adjPct);
  var finalAnnual = Math.max(0, base * (1 + adjPct / 100));
  var el = document.getElementById('rrqPct');
  el.textContent = (adjPct >= 0 ? '+' : '') + adjPct.toFixed(1) + '%';
  el.style.color = adjPct < 0 ? 'var(--accent3)' : adjPct > 0 ? 'var(--accent2)' : 'var(--muted)';
  document.getElementById('rrqFinal').textContent = '= ' + Math.round(finalAnnual) + ' $/an';
}

function updatePsv() {
  var base    = getNumericValue('psvBase', 0);
  var years   = Math.min(40, Math.max(0, Math.round(getNumericValue('psvYears', 40))));
  var age     = Math.round(getNumericValue('psvAge', 65));
  var defer   = Math.max(0, Math.min(5, age - 65));
  var bonusPct = defer * 7.2;
  var prorata  = years / 40;
  var finalAnnual = base * (1 + bonusPct / 100) * prorata;

  var dEl = document.getElementById('psvDefer');
  dEl.textContent = defer > 0 ? '+' + bonusPct.toFixed(1) + '% report' : '+0% report';
  dEl.style.color = defer > 0 ? 'var(--accent2)' : 'var(--muted)';

  var pEl = document.getElementById('psvProrata');
  pEl.textContent = 'x ' + Math.round(prorata * 100) + '% résidence';
  pEl.style.color = prorata < 1 ? 'var(--accent3)' : 'var(--muted)';

  document.getElementById('psvFinal').textContent = '= ' + Math.round(finalAnnual) + ' $/an';
}

function calculate(focusResults) {
  var shouldFocusResults = focusResults === true;
  var currentAge    = Math.round(getNumericValue('currentAge', 0));
  var retirementAge = Math.round(getNumericValue('retirementAge', 0));
  var endAge        = Math.round(getNumericValue('endAge', 0));

  var celiInitialAmount = getNumericValue('celiInitialAmount', 0);
  var celiAnnualContrib = getNumericValue('celiAnnualContrib', 0);
  var celiLimitsEnabled = getLimitMode('celiLimitMode') === 'yes';
  var celiRoomAvailable = getNumericValue('celiRoomAvailable', 0);
  var celiAnnualLimit = getNumericValue('celiAnnualLimit', 7000);

  var reerInitialAmount = getNumericValue('reerInitialAmount', 0);
  var reerAnnualContrib = getNumericValue('reerAnnualContrib', 0);
  var reerLimitsEnabled = getLimitMode('reerLimitMode') === 'yes';
  var reerIncome = getNumericValue('reerIncome', 0);
  var reerRoomAvailable = getNumericValue('reerRoomAvailable', 0);
  var reerRoomRate = getNumericValue('reerRoomRate', 18) / 100;
  var reerAnnualCap = getNumericValue('reerAnnualCap', 33000);

  var nonRegInitialAmount = getNumericValue('nonRegInitialAmount', 0);
  var nonRegAnnualContrib = getNumericValue('nonRegAnnualContrib', 0);

  var contribGrowth = getNumericValue('contribGrowth', 0) / 100;
  var annualGrowth  = getNumericValue('growthRate', 0) / 100;
  var retirGrowth   = getNumericValue('retirGrowthRate', 0) / 100;
  var inflation     = getNumericValue('inflation', 0) / 100;
  var annualWithdraw = getNumericValue('annualWithdrawal', 0);

  // RRQ
  var rrqBase    = getNumericValue('rrqBase', 0);
  var rrqAge     = Math.round(getNumericValue('rrqAge', 65));
  var rrqEffectiveAge = Math.min(rrqAge, 72);
  var rrqDiff    = rrqEffectiveAge - 65;
  var rrqAdjPct  = rrqDiff < 0 ? rrqDiff * 7.2 : rrqDiff * 8.4;
  rrqAdjPct = Math.max(-100, rrqAdjPct);
  var rrqAnnual  = Math.max(0, rrqBase * (1 + rrqAdjPct / 100));

  // PSV
  var psvBase    = getNumericValue('psvBase', 0);
  var psvYears   = Math.min(40, Math.max(0, Math.round(getNumericValue('psvYears', 40))));
  var psvAge     = Math.round(getNumericValue('psvAge', 65));
  var psvDefer   = Math.max(0, Math.min(5, psvAge - 65));
  var psvAnnual  = psvBase * (1 + psvDefer * 0.072) * (psvYears / 40);

  if (retirementAge <= currentAge || endAge <= retirementAge) {
    alert('Vérifiez les âges : actuel < retraite < fin');
    return;
  }

  var celiBalance = celiInitialAmount;
  var reerBalance = reerInitialAmount;
  var nonRegBalance = nonRegInitialAmount;

  var celiDesiredContrib = celiAnnualContrib;
  var reerDesiredContrib = reerAnnualContrib;
  var nonRegDesiredContrib = nonRegAnnualContrib;

  var celiRoom = celiRoomAvailable;
  var reerRoom = reerRoomAvailable;

  var limitWarnings = {
    celi: { total: 0, years: [] },
    reer: { total: 0, years: [] }
  };
  var retirementSnapshot = null;

  function recordLimitWarning(bucket, age, requested, actual) {
    if (requested <= actual + 0.01) return;
    bucket.total += requested - actual;
    if (bucket.years.indexOf(age) === -1 && bucket.years.length < 3) {
      bucket.years.push(age);
    }
  }

  allData = [];
  var totalContrib  = celiInitialAmount + reerInitialAmount + nonRegInitialAmount;
  var totalInterest = 0;
  var totalWithdrawn = 0;
  var bankruptAge   = null;
  var curWithdraw   = annualWithdraw;

  for (var age = currentAge; age < endAge; age++) {
    var isRetired  = age >= retirementAge;
    var rate       = isRetired ? retirGrowth : annualGrowth;
    var desiredWithdrawThisYear = curWithdraw;
    var startCap   = celiBalance + reerBalance + nonRegBalance;
    var yContrib   = 0;
    var yWithdrawn = 0;
    var yInterest  = 0;
    var yearCeliContrib = 0;
    var yearReerContrib = 0;
    var yearNonRegContrib = 0;
    var yearCeliWithdrawn = 0;
    var yearReerWithdrawn = 0;
    var yearNonRegWithdrawn = 0;

    if (!isRetired) {
      if (celiLimitsEnabled) {
        celiRoom += celiAnnualLimit;
      }
      if (reerLimitsEnabled) {
        reerRoom += Math.min(reerIncome * reerRoomRate, reerAnnualCap);
      }
    }

    var rrqActive  = age >= rrqAge;
    var psvActive  = age >= psvAge;
    var govAnnual  = (rrqActive ? rrqAnnual : 0) + (psvActive ? psvAnnual : 0);

    // Monthly compounding
    for (var m = 0; m < 12; m++) {
      var mr       = Math.pow(1 + rate, 1/12) - 1;
      var interestCeli = celiBalance * mr;
      var interestReer = reerBalance * mr;
      var interestNonReg = nonRegBalance * mr;
      celiBalance += interestCeli;
      reerBalance += interestReer;
      nonRegBalance += interestNonReg;
      var interest = interestCeli + interestReer + interestNonReg;
      yInterest += interest;

      if (!isRetired) {
        var celiMonthlyRequested = celiDesiredContrib / 12;
        var celiMonthlyActual = celiLimitsEnabled ? Math.min(celiMonthlyRequested, celiRoom) : celiMonthlyRequested;
        celiBalance += celiMonthlyActual;
        if (celiLimitsEnabled) celiRoom -= celiMonthlyActual;
        yearCeliContrib += celiMonthlyActual;

        var reerMonthlyRequested = reerDesiredContrib / 12;
        var reerMonthlyActual = reerLimitsEnabled ? Math.min(reerMonthlyRequested, reerRoom) : reerMonthlyRequested;
        reerBalance += reerMonthlyActual;
        if (reerLimitsEnabled) reerRoom -= reerMonthlyActual;
        yearReerContrib += reerMonthlyActual;

        var nonRegMonthlyActual = nonRegDesiredContrib / 12;
        nonRegBalance += nonRegMonthlyActual;
        yearNonRegContrib += nonRegMonthlyActual;

        yContrib += celiMonthlyActual + reerMonthlyActual + nonRegMonthlyActual;
      } else {
        var needed = Math.max(0, desiredWithdrawThisYear / 12 - govAnnual / 12);
        var remainingNeeded = needed;
        var withdrawNonReg = Math.min(nonRegBalance, remainingNeeded);
        nonRegBalance -= withdrawNonReg;
        remainingNeeded -= withdrawNonReg;
        yearNonRegWithdrawn += withdrawNonReg;

        var withdrawCeli = Math.min(celiBalance, remainingNeeded);
        celiBalance -= withdrawCeli;
        remainingNeeded -= withdrawCeli;
        yearCeliWithdrawn += withdrawCeli;

        var withdrawReer = Math.min(reerBalance, remainingNeeded);
        reerBalance -= withdrawReer;
        remainingNeeded -= withdrawReer;
        yearReerWithdrawn += withdrawReer;

        var actual = withdrawNonReg + withdrawCeli + withdrawReer;
        yWithdrawn += actual;
        if (actual < needed && bankruptAge === null) {
          bankruptAge = age + (m / 12);
          celiBalance = 0;
          reerBalance = 0;
          nonRegBalance = 0;
          break;
        }
      }
    }

    if (!isRetired) {
      if (celiLimitsEnabled) recordLimitWarning(limitWarnings.celi, age, celiDesiredContrib, yearCeliContrib);
      if (reerLimitsEnabled) recordLimitWarning(limitWarnings.reer, age, reerDesiredContrib, yearReerContrib);
      celiDesiredContrib *= (1 + contribGrowth);
      reerDesiredContrib *= (1 + contribGrowth);
      nonRegDesiredContrib *= (1 + contribGrowth);

      if (age + 1 === retirementAge) {
        retirementSnapshot = {
          celiBalance: celiBalance,
          reerBalance: reerBalance,
          nonRegBalance: nonRegBalance,
          totalBalance: celiBalance + reerBalance + nonRegBalance,
          celiRoom: celiLimitsEnabled ? celiRoom : null,
          reerRoom: reerLimitsEnabled ? reerRoom : null,
          totalContrib: totalContrib,
          totalInterest: totalInterest
        };
      }
    } else {
      curWithdraw *= (1 + inflation);
    }

    totalContrib   += yContrib;
    totalInterest  += yInterest;
    totalWithdrawn += yWithdrawn;

    var yearIncomeAvailable = isRetired
      ? Math.min(desiredWithdrawThisYear, yWithdrawn + govAnnual)
      : 0;

    allData.push({
      age:         age,
      startCapital: startCap,
      endCapital:  celiBalance + reerBalance + nonRegBalance,
      yearContrib: yContrib,
      yearWithdrawn: yWithdrawn,
      yearIncomeAvailable: yearIncomeAvailable,
      yearInterest: yInterest,
      totalContrib: totalContrib,
      totalInterest: totalInterest,
      totalWithdrawn: totalWithdrawn,
      isRetired:   isRetired,
      govAnnual:   govAnnual,
      rrqActive:   rrqActive,
      psvActive:   psvActive,
      celiBalance: celiBalance,
      reerBalance: reerBalance,
      nonRegBalance: nonRegBalance,
      celiRoom: celiRoom,
      reerRoom: reerRoom
    });
  }

  simulationSummary.retirementSnapshot = retirementSnapshot || {
    celiBalance: celiBalance,
    reerBalance: reerBalance,
    nonRegBalance: nonRegBalance,
    totalBalance: celiBalance + reerBalance + nonRegBalance,
    celiRoom: celiLimitsEnabled ? celiRoom : null,
    reerRoom: reerLimitsEnabled ? reerRoom : null,
    totalContrib: totalContrib,
    totalInterest: totalInterest
  };
  simulationSummary.limitWarnings = [limitWarnings.celi, limitWarnings.reer];
  simulationSummary.limitSettings = {
    celi: celiLimitsEnabled,
    reer: reerLimitsEnabled
  };

  renderResults(retirementAge, endAge, totalContrib, bankruptAge, psvAge, psvAnnual, rrqAge, rrqAnnual);
  document.getElementById('results').style.display = 'block';

  if (shouldFocusResults) {
    var resultsEl = document.getElementById('results');
    if (resultsEl) {
      resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function renderResults(retirementAge, endAge, totalContribBase, bankruptAge, psvAge, psvAnnual, rrqAge, rrqAnnual) {
  var retData   = null;
  for (var i = 0; i < allData.length; i++) { if (allData[i].age === retirementAge) { retData = allData[i]; break; } }
  var finalData = allData[allData.length - 1];
  var retirementSnapshot = simulationSummary.retirementSnapshot || { celiBalance: 0, reerBalance: 0, nonRegBalance: 0, celiRoom: 0, reerRoom: 0, totalBalance: 0, totalContrib: 0, totalInterest: 0 };
  var limitSettings = simulationSummary.limitSettings || { celi: true, reer: true };

  var capRet   = retirementSnapshot.totalBalance || (retData ? retData.endCapital : 0);
  var totCont  = retirementSnapshot.totalContrib || (retData ? retData.totalContrib : totalContribBase);
  var totInt   = retirementSnapshot.totalInterest || (retData ? retData.totalInterest : 0);
  var finalCap = finalData ? finalData.endCapital  : 0;

  document.getElementById('sRetirement').textContent = fmtFull(capRet);
  document.getElementById('sContrib').textContent    = fmtFull(totCont);
  document.getElementById('sInterest').textContent   = fmtFull(totInt);

  var fe = document.getElementById('sFinal');
  fe.textContent = fmtFull(finalCap);
  fe.className   = 'stat-value ' + (finalCap > 0 ? 'green' : 'red');
  document.getElementById('sFinalLifeLabel').textContent = 'Montant en fin de vie (à ' + endAge + ' ans)';
  document.getElementById('sCeli').textContent = fmtFull(retirementSnapshot.celiBalance || 0);
  document.getElementById('sReer').textContent = fmtFull(retirementSnapshot.reerBalance || 0);
  document.getElementById('sNonReg').textContent = fmtFull(retirementSnapshot.nonRegBalance || 0);
  document.getElementById('sCeliDetail').textContent = limitSettings.celi
    ? 'Droits restants: ' + fmtFull(Math.max(0, retirementSnapshot.celiRoom || 0))
    : 'Limites de cotisation desactivees';
  document.getElementById('sReerDetail').textContent = limitSettings.reer
    ? 'Droits restants: ' + fmtFull(Math.max(0, retirementSnapshot.reerRoom || 0))
    : 'Limites de cotisation desactivees';
  document.getElementById('sNonRegDetail').textContent = 'Aucune limite de cotisation';

  var warnEl = document.getElementById('nWarn');

  var limitWarnings = simulationSummary.limitWarnings || [];
  var warningParts = [];

  if (limitWarnings[0] && limitWarnings[0].total > 0) {
    warningParts.push('CELI: ' + fmtFull(limitWarnings[0].total) + ' de cotisations ont été plafonnées' + (limitWarnings[0].years.length ? ' (premier dépassement à ' + limitWarnings[0].years[0] + ' ans)' : '') + '.');
  }
  if (limitWarnings[1] && limitWarnings[1].total > 0) {
    warningParts.push('REER: ' + fmtFull(limitWarnings[1].total) + ' de cotisations ont été plafonnées' + (limitWarnings[1].years.length ? ' (premier dépassement à ' + limitWarnings[1].years[0] + ' ans)' : '') + '.');
  }

  if (bankruptAge !== null || warningParts.length > 0) {
    warnEl.style.display = 'block';
    var warnLines = [];
    if (bankruptAge !== null) {
      warnLines.push('Votre capital s\'épuise vers ' + Math.floor(bankruptAge) + ' ans. Considérez augmenter vos cotisations, réduire vos retraits ou retarder votre retraite.');
    }
    if (warningParts.length > 0) {
      warnLines = warnLines.concat(warningParts);
    }
    var warnText = warnLines.map(function(line) {
      return '<span class="notice-warn-line">' + line + '</span>';
    }).join('');
    warnEl.innerHTML = '<span class="notice-warn-head"><span class="notice-warn-icon">X</span><span class="notice-warn-title">PROBLÈMES DÉTECTÉS</span></span><span class="notice-warn-body">' + warnText + '</span>';
  } else {
    warnEl.style.display = 'none';
  }

  renderChart(retirementAge, psvAge, rrqAge);
  renderTable(retirementAge, psvAge, rrqAge);
}

function renderChart(retirementAge, psvAge, rrqAge) {
  var barsArea = document.getElementById('barsArea');
  var chartInner = document.getElementById('chartInner');
  barsArea.innerHTML = '';
  var oldGrid = chartInner.querySelector('.dyn-grid');
  if (oldGrid) oldGrid.remove();

  var maxCap = 1;
  for (var i = 0; i < allData.length; i++) { if (allData[i].endCapital > maxCap) maxCap = allData[i].endCapital; }

  var tickCount = 5;
  var yStep = niceTickStep(maxCap, tickCount);
  var yMax = yStep * tickCount;

  var minWidth = Math.max(620, allData.length * 18 + 120);
  chartInner.style.minWidth = minWidth + 'px';

  var gc = document.createElement('div');
  gc.className = 'dyn-grid';
  for (var g = 0; g <= tickCount; g++) {
    var pct = g / tickCount;
    var val = yMax * (1 - pct);
    var line = document.createElement('div');
    line.className = 'dyn-grid-line';
    line.style.top = (pct * 100) + '%';
    var lbl = document.createElement('div');
    lbl.className = 'dyn-grid-label';
    lbl.style.top = (pct * 100) + '%';
    lbl.textContent = fmt(val);
    gc.appendChild(line);
    gc.appendChild(lbl);
  }
  barsArea.parentElement.insertBefore(gc, barsArea);

  var retIdx = -1;
  var rrqIdx = -1;
  var psvIdx = -1;
  for (var i = 0; i < allData.length; i++) {
    if (retIdx < 0 && allData[i].isRetired) retIdx = i;
    if (rrqIdx < 0 && allData[i].rrqActive) rrqIdx = i;
    if (psvIdx < 0 && allData[i].psvActive) psvIdx = i;
  }
  for (var i = 0; i < allData.length; i++) {
    var d = allData[i];
    var group = document.createElement('div');
    group.className = 'bar-group';
    if (d.isRetired) group.classList.add('is-retired');
    var stack = document.createElement('div');
    stack.className = 'bar-stack';
    var totalH = Math.max(0, (d.endCapital / yMax) * 100);
    var st = document.createElement('div');
    st.className = 'bar-segment ' + (d.isRetired ? 'total-retired' : 'total-accum');
    st.style.height = totalH + '%';
    stack.appendChild(st);

    group.appendChild(stack);

    var showLbl = allData.length <= 30 || d.age % 5 === 0 || i === 0 || i === allData.length - 1;
    var le = document.createElement('div');
    le.className = 'bar-label';
    le.textContent = showLbl ? d.age : '';
    group.appendChild(le);

    // Phase markers
    if (i === retIdx && retIdx > 0) {
      var ml = document.createElement('div');
      ml.className = 'phase-marker-ret';
      var mt = document.createElement('div');
      mt.className = 'phase-label-ret';
      mt.textContent = 'RETRAITE';
      group.appendChild(ml); group.appendChild(mt);
    }

    if (i === rrqIdx && rrqIdx > 0) {
      var rLine = document.createElement('div');
      rLine.className = 'phase-marker-rrq';
      var rTxt = document.createElement('div');
      rTxt.className = 'phase-label-rrq';
      rTxt.textContent = 'RRQ';
      group.appendChild(rLine); group.appendChild(rTxt);
    }

    if (i === psvIdx && psvIdx > 0) {
      var pLine = document.createElement('div');
      pLine.className = 'phase-marker-psv';
      var pTxt = document.createElement('div');
      pTxt.className = 'phase-label-psv';
      pTxt.textContent = 'PSV';
      group.appendChild(pLine); group.appendChild(pTxt);
    }
    // Tooltip (closure)
    (function(d) {
      var tooltip = document.getElementById('tooltip');
      group.addEventListener('mousemove', function(e) {
        tooltip.style.display = 'block';
        tooltip.style.left = Math.min(e.clientX + 14, window.innerWidth - 230) + 'px';
        tooltip.style.top  = (e.clientY - 10) + 'px';
        var phaseLabel = d.isRetired ? 'RETRAITE' : 'ACCUMULATION';
        var mainLabel = d.isRetired ? 'Retrait disponible' : 'Cotisation annuelle';
        var mainValue = d.isRetired
          ? '<span style="color:var(--accent3)">-' + fmtFull(d.yearIncomeAvailable || 0) + '</span>'
          : '<span style="color:var(--blue)">+' + fmtFull(d.yearContrib) + '</span>';
        var govRow = (d.isRetired && d.govAnnual > 0)
          ? '<div class="tt-item full"><span class="tt-key">Revenu gouv./an</span><span class="tt-value" style="color:var(--purple)">+' + fmtFull(d.govAnnual) + '</span></div>'
          : '';
        tooltip.innerHTML =
          '<div class="tt-head"><div class="tt-age">' + (d.isRetired ? '🌴' : '📈') + ' ' + d.age + ' ans</div><div class="tt-phase">' + phaseLabel + '</div></div>' +
          '<div class="tt-main"><span class="tt-key">Capital total</span><span class="tt-value" style="color:var(--accent)">' + fmtFull(d.endCapital) + '</span></div>' +
          '<div class="tt-grid"><div class="tt-item"><span class="tt-key">' + mainLabel + '</span><span class="tt-value">' + mainValue + '</span></div><div class="tt-item"><span class="tt-key">Rendement annuel</span><span class="tt-value" style="color:var(--green)">+' + fmtFull(d.yearInterest) + '</span></div></div>' +
          govRow;
      });
      group.addEventListener('mouseleave', function() { tooltip.style.display = 'none'; });
    })(d);

    barsArea.appendChild(group);
  }
}

function updatePhaseRail(preCount, retCount) {
  var rail = document.getElementById('phaseRail');
  var pre = document.getElementById('phasePre');
  var ret = document.getElementById('phaseRet');
  if (!rail || !pre || !ret) return;

  var safePre = Math.max(0, preCount || 0);
  var safeRet = Math.max(0, retCount || 0);
  var total = safePre + safeRet;

  if (total <= 0) {
    safePre = allData.length;
    safeRet = 0;
  }

  pre.style.flex = safePre + ' 0 0';
  ret.style.flex = safeRet + ' 0 0';
  ret.style.display = safeRet > 0 ? 'flex' : 'none';
}

function renderTable(retirementAge, psvAge, rrqAge) {
  var tbody = document.getElementById('tbody');
  tbody.innerHTML = '';
  var toggleBtn = document.getElementById('toggleBtn');

  var transitionIdx = -1;
  for (var t = 1; t < allData.length; t++) {
    if (allData[t].isRetired && !allData[t - 1].isRetired) {
      transitionIdx = t;
      break;
    }
  }

  var hidableRows = 0;
  for (var h = 0; h < allData.length; h++) {
    var keepTransitionRow = transitionIdx >= 0 && (h === transitionIdx - 1 || h === transitionIdx);
    var canHideThisRow = h >= 5 && h < allData.length - 5 && !keepTransitionRow;
    if (canHideThisRow) hidableRows++;
  }

  var canCollapse = hidableRows >= 3;
  if (!canCollapse) showAll = true;

  if (toggleBtn) {
    toggleBtn.style.display = canCollapse ? 'inline-flex' : 'none';
    toggleBtn.textContent = showAll ? 'Réduire' : 'Voir tout';
  }

  var isCollapsed = canCollapse && !showAll;
  var hideFlags = [];
  for (var hf = 0; hf < allData.length; hf++) {
    var keepTransitionForHide = transitionIdx >= 0 && (hf === transitionIdx - 1 || hf === transitionIdx);
    hideFlags[hf] = isCollapsed && hf >= 5 && hf < allData.length - 5 && !keepTransitionForHide;
  }

  var separatorInsertIdx = -1;
  if (isCollapsed) {
    for (var si = 1; si < hideFlags.length; si++) {
      if (hideFlags[si - 1] && !hideFlags[si]) {
        separatorInsertIdx = si;
        break;
      }
    }
  }

  var showTransitionSeparator = separatorInsertIdx >= 0;
  var visiblePreCount = 0;
  var visibleRetCount = 0;

  for (var i = 0; i < allData.length; i++) {
    var d  = allData[i];

    if (showTransitionSeparator && i === separatorInsertIdx) {
      var sep = document.createElement('tr');
      sep.className = 'ellipsis-row';
      sep.setAttribute('role', 'button');
      sep.setAttribute('tabindex', '0');
      sep.setAttribute('aria-label', 'Afficher toutes les lignes du tableau');
      sep.innerHTML = '<td colspan="7"><span class="ellipsis-dots" aria-hidden="true"><span></span><span></span><span></span></span></td>';
      sep.addEventListener('click', function() {
        animateTableVisibilityChange(true);
      });
      sep.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          animateTableVisibilityChange(true);
        }
      });
      tbody.appendChild(sep);
    }

    var tr = document.createElement('tr');

    if (d.isRetired && i > 0 && !allData[i-1].isRetired) tr.className = 'ret-row';
    if (i > 0 && ((d.psvActive && !allData[i-1].psvActive) || (d.rrqActive && !allData[i-1].rrqActive))) tr.className = 'gov-row';

    var keepTransitionRows = transitionIdx >= 0 && (i === transitionIdx - 1 || i === transitionIdx);
  var hide = hideFlags[i];
    if (hide) tr.classList.add('hidden');
    if (!hide) {
      if (d.isRetired) visibleRetCount++;
      else visiblePreCount++;
    }

    var ageLabel = d.age;
    var govCell  = d.govAnnual > 0
      ? '<td class="pos">+' + fmtFull(d.govAnnual) + '/an</td>'
      : '<td><span class="dash-placeholder">--</span></td>';

    var withdrawDisplay = d.isRetired ? (d.yearIncomeAvailable || 0) : d.yearWithdrawn;

    tr.innerHTML =
      '<td>' + ageLabel + '</td>' +
      '<td>' + fmtFull(d.startCapital) + '</td>' +
      '<td class="' + (d.yearContrib > 0 ? 'pos' : '') + '">' + (d.yearContrib > 0 ? '+' + fmtFull(d.yearContrib) : '<span class="dash-placeholder">--</span>') + '</td>' +
      '<td class="' + (withdrawDisplay > 0 ? 'neg' : '') + '">' + (withdrawDisplay > 0 ? '-' + fmtFull(withdrawDisplay) : '<span class="dash-placeholder">--</span>') + '</td>' +
      govCell +
      '<td class="pos">+' + fmtFull(d.yearInterest) + '</td>' +
      '<td style="font-weight:700">' + fmtFull(d.endCapital) + '</td>';

    tbody.appendChild(tr);
  }

  // The rail spans header + body rows. Assign header height to the pre-retirement segment
  // so pre-retirement years remain fully covered in both collapsed and expanded views.
  visiblePreCount += 1;

  // Attribute ellipsis spacer to the segment where it is inserted.
  if (showTransitionSeparator) {
    var ellipsisInPre = transitionIdx < 0 || separatorInsertIdx <= transitionIdx;
    if (ellipsisInPre) visiblePreCount++;
    else visibleRetCount++;
  }
  updatePhaseRail(visiblePreCount, visibleRetCount);
}

function animateTableVisibilityChange(nextShowAll) {
  var tableLayout = document.querySelector('.table-layout');
  if (!tableLayout) {
    showAll = nextShowAll;
    renderTable();
    return;
  }

  var startHeight = tableLayout.getBoundingClientRect().height;

  showAll = nextShowAll;
  var toggleBtn = document.getElementById('toggleBtn');
  if (toggleBtn) toggleBtn.textContent = showAll ? 'Réduire' : 'Voir tout';
  renderTable();

  var endHeight = tableLayout.scrollHeight;
  if (Math.abs(endHeight - startHeight) < 1) return;

  tableLayout.style.overflow = 'hidden';
  tableLayout.style.height = startHeight + 'px';
  tableLayout.style.transition = 'height 280ms cubic-bezier(0.16, 1, 0.3, 1)';
  void tableLayout.offsetHeight;
  tableLayout.style.height = endHeight + 'px';

  function cleanup(event) {
    if (event.propertyName !== 'height') return;
    tableLayout.style.height = '';
    tableLayout.style.transition = '';
    tableLayout.style.overflow = '';
    tableLayout.removeEventListener('transitionend', cleanup);
  }

  tableLayout.addEventListener('transitionend', cleanup);
}

function toggleTable() {
  animateTableVisibilityChange(!showAll);
}

initNumericInputFormatting();
updateRrq();
updatePsv();
initLimitControls();
initAssistant();
calculate();

// Initialize theme on page load
initTheme();
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
