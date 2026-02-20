// ============================================
// EkoBrazil - Painel de Aniversariantes
// ============================================
// Este arquivo contém toda a lógica do front-end:
// - "Base de dados" de colaboradores (array JS).
// - Filtro automático dos aniversariantes do dia.
// - Busca por nome.
// - Geração dos cards de aniversariantes.
// - Integração com WhatsApp (link com mensagem).
// ============================================

  /**
   * Chave utilizada para persistir os contatos no navegador.
   */
  const LOCAL_STORAGE_KEY = "ekobrazil_contacts_v1";
  const LOCAL_STORAGE_SENT_KEY = "ekobrazil_sent_flags_v1";

  /**
   * Dados ativos de contatos.
   * - Começa como uma cópia de CONTACTS ou do que estiver salvo no localStorage.
   * - Quando o usuário importa um relatório, este array é substituído.
   */
  let contactsData = CONTACTS.slice();
  
  /**
   * URL de uma imagem comemorativa de exemplo.
   * Aqui usamos uma imagem pública; em produção, seria um link da própria empresa.
   */
  const WHATSAPP_IMAGE_URL =
    "https://images.pexels.com/photos/2072160/pexels-photo-2072160.jpeg";
  
  /**
   * Mantém o array com os aniversariantes de hoje (filtrado por data).
   * Isso é usado para:
   * - Render inicial.
   * - Filtrar novamente quando o usuário buscar por nome.
   */
  let birthdaysToday = [];

  /**
   * Data de referência atualmente selecionada para o filtro
   * (formato DD/MM). Se for null, usa a data de hoje.
   */
  let currentReferenceDayMonth = null;

  /**
   * Flags de "mensagem enviada" por data e contato.
   * Estrutura:
   * {
   *   "DD/MM": {
   *      "contactKey": true
   *   }
   * }
   */
  let sentFlagsByDate = {};

  /**
   * Função utilitária para obter a data atual no formato DD/MM.
   */
  function getTodayInfo() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
  
    return {
      day,
      month,
      formatted: `${day}/${month}`
    };
  }
  
  /**
   * Calcula os dados de datas inteligentes para envio de mensagens.
   * Baseado no dia da semana, retorna quais datas devem aparecer.
   * 
   * Lógica:
   * - Segunda (1): seg + ter (recupera segunda)
   * - Terça-quinta (2-4): próximo dia
   * - Sexta (5): sábado + domingo
   * - Sábado-domingo (6-0): segunda (próximo dia útil)
   * 
   * @returns {Array<string>} array com datas no formato DD/MM
   */
  function getDateReferencesForMessage() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=domingo, 1=segunda, ..., 6=sábado
    const dates = [];
    
    switch (dayOfWeek) {
      case 1: // Segunda-feira: mostrar segunda + terça
        dates.push(getTodayInfo().formatted); // segunda
        const nextDay = new Date(today);
        nextDay.setDate(nextDay.getDate() + 1);
        dates.push(
          `${String(nextDay.getDate()).padStart(2, "0")}/${String(nextDay.getMonth() + 1).padStart(2, "0")}`
        ); // terça
        break;
        
      case 2: // Terça-feira: próximo dia (quarta)
      case 3: // Quarta-feira: próximo dia (quinta)
      case 4: // Quinta-feira: próximo dia (sexta)
        const next = new Date(today);
        next.setDate(next.getDate() + 1);
        dates.push(
          `${String(next.getDate()).padStart(2, "0")}/${String(next.getMonth() + 1).padStart(2, "0")}`
        );
        break;
        
      case 5: // Sexta-feira: mostrar sábado + domingo
        const sat = new Date(today);
        sat.setDate(sat.getDate() + 1);
        dates.push(
          `${String(sat.getDate()).padStart(2, "0")}/${String(sat.getMonth() + 1).padStart(2, "0")}`
        ); // sábado
        const sun = new Date(today);
        sun.setDate(sun.getDate() + 2);
        dates.push(
          `${String(sun.getDate()).padStart(2, "0")}/${String(sun.getMonth() + 1).padStart(2, "0")}`
        ); // domingo
        break;
        
      case 6: // Sábado: próximo dia útil (segunda)
      case 0: // Domingo: próximo dia útil (segunda)
        const nextMonday = new Date(today);
        const daysUntilMonday = dayOfWeek === 6 ? 2 : 1;
        nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
        dates.push(
          `${String(nextMonday.getDate()).padStart(2, "0")}/${String(nextMonday.getMonth() + 1).padStart(2, "0")}`
        );
        break;
    }
    
    return dates;
  }
  
  /**
   * Combina contatos de múltiplas datas de referência.
   * Usado para exibir aniversariantes quando há mais de uma data a mostrar.
   * 
   * @param {Array} contacts - lista completa de contatos
   * @param {Array<string>} dateReferences - array de datas em formato DD/MM
   * @returns {Array} lista de contatos combinados das datas especificadas
   */
  function filterBirthdaysByDates(contacts, dateReferences) {
    if (!Array.isArray(dateReferences)) return [];
    const combined = [];
    const seen = new Set();
    
    for (const dateRef of dateReferences) {
      const filtered = contacts.filter((c) => c.birthday === dateRef);
      for (const contact of filtered) {
        const key = getContactKey(contact);
        if (!seen.has(key)) {
          combined.push(contact);
          seen.add(key);
        }
      }
    }
    
    return combined;
  }
  
  /**
   * Filtra os contatos cujo aniversário (DD/MM) coincide com a data escolhida.
   *
   * @param {Array} contacts - lista completa de contatos
   * @param {string|Array} [referenceDayMonth] - data de referência no formato DD/MM ou array de datas.
   * @returns {Array} lista dos aniversariantes no dia informado
   */
  function filterBirthdaysForToday(contacts, referenceDayMonth) {
    // Se for um array, usa a função de múltiplas datas
    if (Array.isArray(referenceDayMonth)) {
      return filterBirthdaysByDates(contacts, referenceDayMonth);
    }
    
    const base = referenceDayMonth || getTodayInfo().formatted;
    return contacts.filter((contact) => contact.birthday === base);
  }
  
  /**
   * Normaliza strings para comparação (busca case-insensitive e sem acentos).
   *
   * @param {string} value
   * @returns {string}
   */
  function normalizeString(value) {
    if (!value) return "";
    return value
      .toLowerCase()
      .normalize("NFD") // separa acentos das letras
      .replace(/[\u0300-\u036f]/g, ""); // remove marcas de acento
  }
  
  /**
   * Atualiza o texto do contador "X aniversariantes hoje".
   *
   * @param {number} count
   */
  function updateBirthdayCounter(count) {
    const counterElement = document.getElementById("birthdayCount");
    if (counterElement) {
      counterElement.textContent = String(count);
    }
  }
  
  /**
   * Atualiza a data exibida no badge (Hoje / Data selecionada).
   * Agora suporta também arrays de datas.
   *
   * @param {string|Array} [referenceDayMonth] - data de referência no formato DD/MM ou array de datas.
   */
  function updateTodayDateDisplay(referenceDayMonth) {
    const todayInfo = getTodayInfo();
    let dateToShow = todayInfo.formatted;
    let label = "Hoje";

    if (Array.isArray(referenceDayMonth) && referenceDayMonth.length > 0) {
      // Se for um array, mostra as múltiplas datas
      dateToShow = referenceDayMonth.join(" / ");
      label = referenceDayMonth.includes(todayInfo.formatted) ? "Datas a enviar" : "Datas selecionadas";
    } else if (typeof referenceDayMonth === "string") {
      dateToShow = referenceDayMonth;
      label = referenceDayMonth === todayInfo.formatted ? "Hoje" : "Data selecionada";
    }

    const todayElement = document.getElementById("todayDate");
    const labelElement = document.querySelector(".today-label");

    if (todayElement) {
      todayElement.textContent = dateToShow;
    }

    if (labelElement) {
      labelElement.textContent = label;
    }
  }
  
  /**
   * Atualiza o ano no rodapé (para não precisar mexer manualmente).
   */
  function updateFooterYear() {
    const yearElement = document.getElementById("currentYear");
    if (yearElement) {
      yearElement.textContent = String(new Date().getFullYear());
    }
  }

/**
 * Lê, quando existir, uma lista de contatos persistida no localStorage.
 *
 * @returns {Array|null}
 */
function loadContactsFromStorage() {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;

    // Garante que cada item tem os campos esperados
    const normalized = data
      .map((item) =>
        mapRawContact({
          name: item.name,
          nome: item.name,
          phone: item.phone,
          telefone: item.phone,
          birthday: item.birthday,
          data_nascimento: item.birthday
        })
      )
      .filter((c) => c !== null);

    return normalized.length ? normalized : null;
  } catch (error) {
    console.error("Falha ao carregar contatos do localStorage:", error);
    return null;
  }
}

/**
 * Salva a lista atual de contatos ativos no localStorage.
 *
 * @param {Array} contacts
 */
function saveContactsToStorage(contacts) {
  try {
    const payload = Array.isArray(contacts) ? contacts : [];
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error("Falha ao salvar contatos no localStorage:", error);
  }
}

/**
 * Carrega flags de mensagens enviadas do localStorage.
 */
function loadSentFlagsFromStorage() {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_SENT_KEY);
    if (!raw) {
      sentFlagsByDate = {};
      return;
    }
    const data = JSON.parse(raw);
    sentFlagsByDate = data && typeof data === "object" ? data : {};
  } catch (error) {
    console.error("Falha ao carregar flags de envio do localStorage:", error);
    sentFlagsByDate = {};
  }
}

/**
 * Salva as flags de mensagens enviadas no localStorage.
 */
function saveSentFlagsToStorage() {
  try {
    window.localStorage.setItem(
      LOCAL_STORAGE_SENT_KEY,
      JSON.stringify(sentFlagsByDate || {})
    );
  } catch (error) {
    console.error("Falha ao salvar flags de envio no localStorage:", error);
  }
}

/**
 * Retorna a data de referência atual (DD/MM).
 * Se nenhuma tiver sido escolhida, usa a data de hoje.
 *
 * @returns {string}
 */
function getCurrentReferenceDayMonth() {
  return currentReferenceDayMonth || getTodayInfo().formatted;
}

/**
 * Gera uma chave única para um contato (para registrar flags de envio).
 *
 * @param {Object} contact
 * @returns {string}
 */
function getContactKey(contact) {
  const phone = String(contact.phone || "").trim();
  const name = normalizeString(contact.name || "");
  return `${phone}__${name}`;
}

/**
 * Normaliza telefone: remove caracteres especiais mantendo apenas números
 * 
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  if (!phone) return "";
  return phone.replace(/\D/g, ""); // remove tudo que não seja dígito
}

/**
 * Converte um objeto genérico vindo de JSON/CSV para o formato interno.
 * Aceita tanto chaves em inglês (name, phone, birthday) quanto em português
 * (nome, telefone, data_nascimento, aniversario, data_aniversario).
 *
 * @param {Object} raw - registro cru do arquivo
 * @returns {{ name: string, phone: string, birthday: string } | null}
 */
function mapRawContact(raw) {
  if (!raw || typeof raw !== "object") return null;

  // Permite tanto "name" quanto "nome" (etc.)
  const possibleNameKeys = ["name", "nome"];
  const possiblePhoneKeys = ["phone", "telefone", "telefone_whatsapp", "fone"];
  const possibleBirthdayKeys = [
    "birthday",
    "data_nascimento",
    "aniversario",
    "data_aniversario"
  ];

  const findFirst = (keys) =>
    keys.map((k) => (k in raw ? raw[k] : null)).find((v) => v != null);

  const name = String(findFirst(possibleNameKeys) || "").trim();
  const phoneRaw = String(findFirst(possiblePhoneKeys) || "").trim();
  const phone = normalizePhone(phoneRaw); // Remove caracteres especiais
  const birthday = String(findFirst(possibleBirthdayKeys) || "").trim();

  if (!name || !phone || !birthday) {
    return null;
  }

  // Normaliza data para formato DD/MM simples (sem ano)
  const birthdayClean = birthday.substring(0, 5);

  return {
    name,
    phone,
    birthday: birthdayClean
  };
}

/**
 * Tenta interpretar o texto de um arquivo como JSON (preferencialmente).
 *
 * Formato esperado (exemplo):
 * [
 *   { "nome": "Fulano", "telefone": "5511999999999", "data_nascimento": "05/10" },
 *   { "name": "Beltrano", "phone": "5511888888888", "birthday": "12/02" }
 * ]
 *
 * @param {string} text
 * @returns {Array|null}
 */
function tryParseContactsFromJson(text) {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return null;

    const mapped = data
      .map(mapRawContact)
      .filter((c) => c !== null);

    return mapped.length ? mapped : null;
  } catch (e) {
    return null;
  }
}

/**
 * Tenta interpretar o texto como CSV simples.
 *
 * Suporta separador por vírgula ou ponto-e-vírgula e
 * cabeçalhos em português ou inglês.
 *
 * Exemplo de cabeçalho:
 *   nome;telefone;data_nascimento
 *   name,phone,birthday
 *
 * @param {string} text
 * @returns {Array|null}
 */
function tryParseContactsFromCsv(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const delimiter = trimmed.includes(";") ? ";" : ",";
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return null;

  const headerLine = lines[0];
  const headers = headerLine
    .split(delimiter)
    .map((h) => normalizeString(h.trim()))
    .map((h) => h.replace(/[^a-z_]/g, "")); // remove caracteres estranhos

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter);
    const raw = {};

    headers.forEach((header, idx) => {
      let value = parts[idx] != null ? parts[idx].trim() : "";

      // Remove aspas simples ou duplas que envolvem todo o valor
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      raw[header] = value;
    });

    // Recria um objeto com chaves mais próximas do mapRawContact
    const normalizedRaw = {
      name: raw.name || raw.nome,
      phone: raw.phone || raw.fone || raw.telefone,
      birthday: raw.birthday || raw.aniversario || raw.datadeaniversario || raw.dataaniversario || raw.datanascimento || raw.dataddenascimento
    };

    const mapped = mapRawContact(normalizedRaw);
    if (mapped) {
      records.push(mapped);
    } else {
      // Log para debug (comentado, mas pode ser ativado)
      // console.warn("Contato descartado:", normalizedRaw);
    }
  }

  console.info(`CSV: ${records.length} contato(s) parseado(s) com sucesso`);
  return records.length ? records : null;
}

/**
 * Faz o parse do conteúdo textual de um arquivo de relatório
 * (JSON ou CSV) e devolve a lista de contatos.
 *
 * @param {string} text
 * @returns {Array}
 */
function parseContactsFromText(text) {
  // Primeiro tenta JSON, depois CSV
  const fromJson = tryParseContactsFromJson(text);
  if (fromJson) return fromJson;

  const fromCsv = tryParseContactsFromCsv(text);
  if (fromCsv) return fromCsv;

  throw new Error(
    "Formato de arquivo não reconhecido. Use JSON ou CSV com colunas de nome, telefone e data de nascimento."
  );
}

/**
 * Tenta carregar todas as planilhas CSV/JSON localizadas em
 * `assets/planilhas/` e retorna a lista combinada de contatos.
 * Retorna `null` se nenhum arquivo válido for encontrado.
 *
 * Observação: funciona quando o site é servido por HTTP(S). Em
 * ambiente `file://` o `fetch` pode falhar por políticas do navegador.
 *
 * @returns {Promise<Array|null>}
 */
async function loadAllSheetsFromAssets() {
  const basePath = "assets/planilhas/";

  // Nomes exatos dos arquivos presentes no diretório (conforme o repo)
  const files = [
    "Aniversário Janeiro.csv",
    "Aniversário Fevereiro.csv",
    "Aniversário Março.csv",
    "Aniversário Abril.csv",
    "Aniversário Maio.csv",
    "Aniversário Junho.csv",
    "Aniversário Julho.csv",
    "Aniversário Agosto.csv",
    "Aniversário Setembro.csv",
    "Aniversário Outubro.csv",
    "Aniversário Novembro.csv",
    "Aniversário Dezembro.csv"
  ];

  const combined = [];
  let successCount = 0;
  let failCount = 0;

  for (const name of files) {
    const path = basePath + name;

    try {
      const resp = await fetch(encodeURI(path));
      if (!resp.ok) {
        console.warn(`⚠️ ${name}: HTTP ${resp.status}`);
        failCount++;
        continue;
      }

      const text = await resp.text();
      const parsed = parseContactsFromText(text);
      if (Array.isArray(parsed) && parsed.length) {
        combined.push(...parsed);
        console.info(`✓ ${name}: ${parsed.length} registro(s)`);
        successCount++;
      } else {
        console.warn(`⚠️ ${name}: nenhum contato válido`);
        failCount++;
      }
    } catch (err) {
      console.warn(`⚠️ ${name}: ${err.message}`);
      failCount++;
      continue;
    }
  }

  console.info(
    `📊 Planilhas: ${successCount} arquivo(s) processado(s), ${combined.length} contato(s) total`
  );

  return combined.length ? combined : null;
}

/**
 * Aplica uma nova lista de contatos importada:
 * - Atualiza a base em memória.
 * - Recalcula aniversariantes de hoje.
 * - Atualiza contador e cards.
 */
function applyImportedContacts(newContacts, referenceDayMonth) {
  contactsData = Array.isArray(newContacts) ? newContacts : [];

  // Persiste nova base no navegador
  saveContactsToStorage(contactsData);

  birthdaysToday = filterBirthdaysForToday(contactsData, referenceDayMonth);
  updateBirthdayCounter(birthdaysToday.length);

  // Limpa qualquer texto de busca para evitar filtros "fantasmas"
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.value = "";
  }

  renderBirthdayCards(birthdaysToday);
}

/**
 * Lida com o arquivo escolhido no input de relatório.
 * 
 *
 * 
 * @param {File} file
 */
function handleReportFileSelected(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (event) => {
    const text = event.target && event.target.result
      ? String(event.target.result)
      : "";

    try {
      const importedContacts = parseContactsFromText(text);

      if (!Array.isArray(importedContacts) || importedContacts.length === 0) {
        alert(
          "Não foi possível encontrar registros válidos no relatório. Verifique o conteúdo do arquivo."
        );
        return;
      }

      // Usa a data atualmente selecionada (se houver) para recalcular aniversariantes
      const referenceDayMonth = getCurrentReferenceDayMonth();
      applyImportedContacts(importedContacts, referenceDayMonth);

      alert(
        `Relatório importado com sucesso. ${importedContacts.length} contato(s) carregado(s).`
      );
    } catch (error) {
      console.error(error);
      alert(
        "Não foi possível ler o relatório. Certifique-se de que o arquivo está em formato JSON ou CSV válido."
      );
    }
  };

  reader.onerror = () => {
    alert("Ocorreu um erro ao ler o arquivo. Tente novamente.");
  };

  reader.readAsText(file, "utf-8");
}

/**
 * Configura os listeners de importação de relatório.
 * - Clique no botão abre o seletor de arquivo.
 * - Mudança no input de arquivo dispara a leitura.
 */
function setupReportImport() {
  const importButton = document.getElementById("importButton");
  const reportInput = document.getElementById("reportInput");

  if (!importButton || !reportInput) return;

  importButton.addEventListener("click", () => {
    reportInput.click();
  });

  reportInput.addEventListener("change", (event) => {
    const file =
      event.target && event.target.files && event.target.files[0]
        ? event.target.files[0]
        : null;

    if (file) {
      handleReportFileSelected(file);
      // Permite reimportar o mesmo arquivo, limpando o valor
      event.target.value = "";
    }
  });
}

/**
 * Configura o seletor de data para permitir adiantar aniversários.
 */
function setupReferenceDatePicker() {
  const dateInput = document.getElementById("referenceDate");
  if (!dateInput) return;

  // Define valor inicial como hoje
  const todayInfo = getTodayInfo();
  const todayIso = `${new Date().getFullYear()}-${todayInfo.month}-${todayInfo.day}`;
  dateInput.value = todayIso;

  dateInput.addEventListener("change", (event) => {
    const value = event.target.value;

    if (!value) {
      // Se o campo for limpo, volta para hoje
      const today = getTodayInfo();
      currentReferenceDayMonth = today.formatted;
    } else {
      // value vem no formato YYYY-MM-DD
      const [year, month, day] = value.split("-");
      const dd = day.padStart(2, "0");
      const mm = month.padStart(2, "0");
      currentReferenceDayMonth = `${dd}/${mm}`;
    }

    const reference = getCurrentReferenceDayMonth();

    // Atualiza badge, contador e cards com base na nova data
    updateTodayDateDisplay(reference);

    birthdaysToday = filterBirthdaysForToday(contactsData, reference);
    updateBirthdayCounter(birthdaysToday.length);
    renderBirthdayCards(birthdaysToday);
  });
}

  /**
   * Determina em qual data o aniversário é (hoje, amanhã, etc)
   * 
   * @param {string} contactBirthday - data de aniversário em formato DD/MM
   * @returns {string} tipo de data ("today", "tomorrow", "saturday", "sunday", "monday", "other")
   */
  function determineBirthdayType(contactBirthday) {
    const today = getTodayInfo().formatted;
    const dayOfWeek = new Date().getDay(); // 0=domingo, 1=segunda, etc.
    
    if (contactBirthday === today) {
      return "today";
    }

    // Amanhã
    const tomorrow = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
    const tomorrowFormatted = `${String(tomorrow.getDate()).padStart(2, "0")}/${String(tomorrow.getMonth() + 1).padStart(2, "0")}`;
    if (contactBirthday === tomorrowFormatted) {
      return "tomorrow";
    }

    // Sexta-feira: verifica sábado e domingo
    if (dayOfWeek === 5) {
      const sat = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
      const satFormatted = `${String(sat.getDate()).padStart(2, "0")}/${String(sat.getMonth() + 1).padStart(2, "0")}`;
      if (contactBirthday === satFormatted) return "saturday";

      const sun = new Date(new Date().getTime() + 2 * 24 * 60 * 60 * 1000);
      const sunFormatted = `${String(sun.getDate()).padStart(2, "0")}/${String(sun.getMonth() + 1).padStart(2, "0")}`;
      if (contactBirthday === sunFormatted) return "sunday";
    }

    // Segunda-feira: verifica terça (recuperação de fim de semana)
    if (dayOfWeek === 1) {
      const tue = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
      const tueFormatted = `${String(tue.getDate()).padStart(2, "0")}/${String(tue.getMonth() + 1).padStart(2, "0")}`;
      if (contactBirthday === tueFormatted) return "tuesday";
    }

    return "other";
  }

  /**
   * Constrói a mensagem personalizada que será enviada via WhatsApp.
   * A mensagem varia dependendo de quando é o aniversário.
   *
   * @param {Object} contact - contato selecionado
   * @param {string} [birthdayType] - tipo de data ("today", "tomorrow", "saturday", "sunday", "tuesday", "other")
   * @returns {string} mensagem de texto
   */
  function buildWhatsAppMessage(contact, birthdayType = "other") {
    const name = contact.name.split(" ")[0]; // Primeiro nome
    let base = "";

    switch (birthdayType) {
      case "today":
        base =
          `🎂 Olá ${name}! Feliz Aniversário! 🎉\n\n` +
          `A equipe da EkoBrazil deseja que você tenha um dia absolutamente especial, ` +
          `repleto de alegria, saúde e momentos inesquecíveis!\n\n` +
          `Você é muito importante para nós! 💚\n\n` +
          `Aproveite cada momento e tenha um excelente dia!\n\n` +
          `Conte sempre com a EkoBrazil! 🌱`;
        break;

      case "tomorrow":
        base =
          `Olá ${name}! 🎈\n\n` +
          `Amanhã é seu aniversário e queríamos ser um dos primeiros a desejar ` +
          `um feliz aniversário! 🎂🎉\n\n` +
          `Esperamos que seu dia seja tão incrível quanto você merece, ` +
          `cheio de surpresas, conquistas e muito amor!\n\n` +
          `🎁 Que seu aniversário seja especial!\n\n` +
          `Conte com a EkoBrazil para celebrar! 🌱`;
        break;

      case "saturday":
        base =
          `Olá ${name}! 🎊\n\n` +
          `No próximo sábado é seu aniversário e queremos garantir que você ` +
          `tenha o melhor fim de semana do ano! 🎂🎉\n\n` +
          `Aproveite para curtir, relaxar e se cercar de pessoas especiais. ` +
          `Você merece o melhor!\n\n` +
          `Que sua celebração seja inesquecível! 💚\n\n` +
          `Conte sempre com a EkoBrazil! 🌱`;
        break;

      case "sunday":
        base =
          `Olá ${name}! 🎊\n\n` +
          `No próximo domingo é seu aniversário e queremos que você tenha ` +
          `um fim de semana absolutamente especial! 🎂🎉\n\n` +
          `Aproveite o dia para descansar, se divertir e celebrar ` +
          `ao lado de quem você ama!\n\n` +
          `Que seu aniversário seja perfeito! 💚\n\n` +
          `Conte com a EkoBrazil nesta celebração! 🌱`;
        break;

      case "tuesday":
        base =
          `Olá ${name}! 📅\n\n` +
          `Você está entre os aniversariantes desta segunda semana! ` +
          `Queremos começar bem desejando um excelente aniversário para você! 🎂🎉\n\n` +
          `Que você tenha um dia incrível, repleto de momentos especiais, ` +
          `saúde, felicidade e muitas conquistas!\n\n` +
          `Você é muito importante para a gente! 💚\n\n` +
          `Aproveite seu dia especial!\n\nConte com a EkoBrazil! 🌱`;
        break;

      default:
        base =
          `Olá ${name}! 🎉\n\n` +
          `A equipe da EkoBrazil deseja um feliz aniversário! ` +
          `Que seu dia seja incrível, repleto de conquistas, saúde e momentos especiais.`;
        break;
    }

    // Anexa link da imagem comemorativa (solução via cliente: insere URL no texto)
    const withImage = `${base}\n\n🎁 Imagem comemorativa: ${WHATSAPP_IMAGE_URL}`;
    return withImage;
  }
  
  /**
   * Abre uma nova aba/janela com o link do WhatsApp já preenchido.
   *
   * @param {Object} contact - contato selecionado
   */
  function openWhatsAppForContact(contact) {
    const baseUrl = "https://wa.me/";
  
    // Garante que apenas números serão usados (remove espaços, hífens etc.)
    const phoneNumber = String(contact.phone).replace(/[^\d]/g, "");
  
    // Determina o tipo de data para personalizar a mensagem
    const birthdayType = determineBirthdayType(contact.birthday);
    const message = buildWhatsAppMessage(contact, birthdayType);
    const encodedMessage = encodeURIComponent(message);
  
    const fullUrl = `${baseUrl}${phoneNumber}?text=${encodedMessage}`;
  
    // Abre em nova aba para não "tirar" o usuário do sistema
    window.open(fullUrl, "_blank");
  }
  
  /**
   * Determina qual o texto do badge baseado no dia do aniversário
   * 
   * @param {string} contactBirthday - data de aniversário em formato DD/MM
   * @returns {string} texto para o badge
   */
  function getBadgeText(contactBirthday) {
    const birthdayType = determineBirthdayType(contactBirthday);

    switch (birthdayType) {
      case "today":
        return "🎂 Aniversário hoje";
      case "tomorrow":
        return "📅 Amanhã";
      case "saturday":
        return "🎉 Sábado";
      case "sunday":
        return "🎊 Domingo";
      case "tuesday":
        return "📅 Terça";
      default:
        return "🎈 Enviar mensagem";
    }
  }
  
  /**
   * Cria um elemento de card (<article>) para um aniversariante.
   *
   * @param {Object} contact - contato a ser exibido
   * @returns {HTMLElement} card pronto para ser inserido no DOM
   */
  function createBirthdayCard(contact) {
    const card = document.createElement("article");
    card.className = "card";
  
    // Cabeçalho: avatar, nome e informações básicas
    const header = document.createElement("div");
    header.className = "card-header";
  
    const identity = document.createElement("div");
    identity.className = "card-identity";
  
    // Avatar simples com as iniciais da pessoa
    const avatar = document.createElement("div");
    avatar.className = "card-avatar";
  
    const initials = contact.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  
    avatar.textContent = initials;
  
    const nameElement = document.createElement("h3");
    nameElement.className = "card-name";
    nameElement.textContent = contact.name;
  
    identity.appendChild(avatar);
    identity.appendChild(nameElement);
  
    // Metadados: data de nascimento e telefone
    const meta = document.createElement("div");
    meta.className = "card-meta";
  
    const birthdayElement = document.createElement("p");
    birthdayElement.className = "card-birthday";
    birthdayElement.innerHTML = `Nascimento: <strong>${contact.birthday}</strong>`;
  
    const phoneElement = document.createElement("p");
    phoneElement.className = "card-phone";
    phoneElement.textContent = `Telefone: +${contact.phone}`;
  
    meta.appendChild(birthdayElement);
    meta.appendChild(phoneElement);
  
    header.appendChild(identity);
    header.appendChild(meta);
  
    // Badge dinâmico baseado na data
    const badge = document.createElement("span");
    badge.className = "card-badge";
    badge.textContent = getBadgeText(contact.birthday);
  
    // Rodapé: botão WhatsApp + observação + check de enviado
    const footer = document.createElement("div");
    footer.className = "card-footer";
  
    const whatsappButton = document.createElement("button");
    whatsappButton.type = "button";
    whatsappButton.className = "whatsapp-button";
    whatsappButton.setAttribute(
      "aria-label",
      `Enviar mensagem de WhatsApp para ${contact.name}`
    );
  
    const iconSpan = document.createElement("span");
    iconSpan.className = "whatsapp-icon";
    iconSpan.textContent = "🟢"; // Ícone simples (sem depender de bibliotecas)
  
    const labelSpan = document.createElement("span");
    labelSpan.textContent = "Enviar WhatsApp";
  
    whatsappButton.appendChild(iconSpan);
    whatsappButton.appendChild(labelSpan);
  
    // Ao clicar, abre o WhatsApp com a mensagem
    whatsappButton.addEventListener("click", () => {
      openWhatsAppForContact(contact);
    });
  
    const note = document.createElement("span");
    note.className = "card-note";
    note.textContent = "Mensagem personalizada com imagem comemorativa.";
  
    // Área de controle de envio (checkbox)
    const sendControl = document.createElement("label");
    sendControl.className = "send-control";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "send-checkbox";

    const checkboxLabel = document.createElement("span");
    checkboxLabel.className = "send-label";
    checkboxLabel.textContent = "Mensagem enviada";

    // Define estado inicial do checkbox com base nas flags salvas
    const reference = getCurrentReferenceDayMonth();
    const key = getContactKey(contact);
    const sentForDate =
      sentFlagsByDate &&
      sentFlagsByDate[reference] &&
      sentFlagsByDate[reference][key];

    if (sentForDate) {
      checkbox.checked = true;
    }

    checkbox.addEventListener("change", () => {
      const dateKey = getCurrentReferenceDayMonth();
      const contactKey = getContactKey(contact);

      if (!sentFlagsByDate[dateKey]) {
        sentFlagsByDate[dateKey] = {};
      }

      sentFlagsByDate[dateKey][contactKey] = checkbox.checked;
      saveSentFlagsToStorage();
    });

    sendControl.appendChild(checkbox);
    sendControl.appendChild(checkboxLabel);

    footer.appendChild(whatsappButton);
    footer.appendChild(note);
    footer.appendChild(sendControl);
  
    // Monta o card
    card.appendChild(header);
    card.appendChild(badge);
    card.appendChild(footer);
  
    return card;
  }
  
  /**
   * Renderiza a lista de aniversariantes na tela, com base em um array.
   *
   * Também controla as mensagens de "nenhum aniversariante hoje" e
   * "nenhum resultado para a busca".
   *
   * @param {Array} visibleContacts - contatos que devem aparecer (após busca)
   */
  function renderBirthdayCards(visibleContacts) {
    const container = document.getElementById("cardsContainer");
    const emptyState = document.getElementById("emptyState");
    const searchEmptyState = document.getElementById("searchEmptyState");
  
    if (!container || !emptyState || !searchEmptyState) return;
  
    // Se não há aniversariantes hoje, exibimos apenas a mensagem principal
    if (birthdaysToday.length === 0) {
      container.classList.add("hidden");
      emptyState.hidden = false;
      searchEmptyState.hidden = true;
      container.innerHTML = "";
      return;
    }
  
    // Há aniversariantes hoje
    emptyState.hidden = true;
    container.classList.remove("hidden");
  
    // Limpa cards anteriores
    container.innerHTML = "";
  
    // Se, após o filtro de busca, nenhum contato sobrou
    if (visibleContacts.length === 0) {
      searchEmptyState.hidden = false;
      return;
    }
  
    searchEmptyState.hidden = true;
  
    visibleContacts.forEach((contact) => {
      const card = createBirthdayCard(contact);
      container.appendChild(card);
    });
  }
  
  /**
   * Configura o campo de busca por nome.
   * A busca é feita somente dentro da lista de aniversariantes de hoje.
   */
  function setupSearchField() {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;
  
    searchInput.addEventListener("input", (event) => {
      const term = normalizeString(event.target.value);
  
      // Se o campo estiver vazio, mostramos todos os aniversariantes de hoje
      if (!term) {
        renderBirthdayCards(birthdaysToday);
        return;
      }
  
      // Filtra por nome (case-insensitive e ignorando acentos)
      const filtered = birthdaysToday.filter((contact) =>
        normalizeString(contact.name).includes(term)
      );
  
      renderBirthdayCards(filtered);
    });
  }
  
  /**
   * Função principal de inicialização da página.
   * É chamada quando o DOM estiver pronto (DOMContentLoaded).
   * Agora é assíncrona para aguardar o carregamento das planilhas.
   */
  async function initBirthdayDashboard() {
    console.info("🎂 Iniciando painel de aniversariantes...");
    
    // Atualiza data de hoje e ano no rodapé
    updateTodayDateDisplay();
    updateFooterYear();

    // Carrega flags de envio previamente salvas
    loadSentFlagsFromStorage();

    // Tenta carregar base de contatos persistida no navegador.
    // Se existir e for válida, ela substitui a base padrão.
    const storedContacts = loadContactsFromStorage();
    if (storedContacts && storedContacts.length) {
      contactsData = storedContacts;
      console.info(`💾 Carregado ${storedContacts.length} contato(s) do localStorage`);
    } else {
      // Se não houver contatos salvos, tenta carregar as planilhas
      // embarcadas em `assets/planilhas/` (assíncrono).
      try {
        const imported = await loadAllSheetsFromAssets();
        if (imported && imported.length) {
          contactsData = imported;
          console.info(
            `📥 Planilhas importadas: ${imported.length} contato(s) carregado(s).`
          );
        } else {
          console.warn("⚠️ Nenhuma planilha foi carregada com sucesso.");
        }
      } catch (err) {
        console.warn("❌ Falha ao carregar planilhas de assets:", err);
      }
    }
  
    // Define datas de referência com base na lógica inteligente (dia da semana)
    const dateReferences = getDateReferencesForMessage();
    console.info(`📅 Datas de referência calculadas: ${dateReferences.join(", ")}`);
    
    updateTodayDateDisplay(dateReferences);
  
    // Calcula aniversariantes com base nas datas inteligentes
    birthdaysToday = filterBirthdaysForToday(contactsData, dateReferences);
  
    // Persiste os contatos carregados no localStorage
    saveContactsToStorage(contactsData);
  
    // Atualiza o contador de aniversariantes
    updateBirthdayCounter(birthdaysToday.length);
  
    // Renderiza cards iniciais
    renderBirthdayCards(birthdaysToday);

    console.info(
      `✅ Painel iniciado: ${contactsData.length} contato(s) total, ${birthdaysToday.length} aniversariante(s) para enviar`
    );
  
    // Configura campo de busca
    setupSearchField();

    // Configura seletor de data
    setupReferenceDatePicker();

    // Configura importação de relatório
    setupReportImport();
  }
  
  // Garante que o script só rode após o carregamento do DOM
  document.addEventListener("DOMContentLoaded", initBirthdayDashboard);
