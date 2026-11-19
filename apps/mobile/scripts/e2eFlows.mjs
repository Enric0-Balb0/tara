// Pure helpers of scripts/e2e.mjs, tested in e2eFlows.test.mjs: which flows to run, and
// the checks on the secret key and the e2e user. Messages are in Italian, like the script.

// Tags listed in the flow header (the part before `---`).
export function flowTags(text) {
  const header = text.split(/^---\r?$/m)[0];
  const block = header.match(/^tags:[ \t]*\r?\n((?:[ \t]+-[ \t]*\S+[ \t]*\r?\n?)+)/m);
  return block ? [...block[1].matchAll(/-\s*(\S+)/g)].map((match) => match[1]) : [];
}

// "ricerca", "ricerca.yaml" and ".maestro/ricerca.yaml" all name the same flow.
export function flowName(arg) {
  return arg.split(/[\\/]/).pop().replace(/\.yaml$/, '');
}

// files: [{ file, tags }]. Asking for a flow that does not exist, or that a tag excludes,
// is a problem: running fewer flows than asked must never look like a green run.
export function selectFlows(files, only, excludedTags) {
  const problems = [];
  const names = files.map(({ file }) => flowName(file));
  const wanted = new Set(only.map(flowName));
  for (const name of wanted) {
    if (!names.includes(name)) {
      problems.push(`Flusso sconosciuto: ${name}. Esistono: ${[...names].sort().join(', ')}.`);
    }
  }
  const flows = [];
  for (const { file, tags } of [...files].sort((a, b) => a.file.localeCompare(b.file))) {
    const name = flowName(file);
    if (wanted.size > 0 && !wanted.has(name)) continue;
    const excluded = tags.find((tag) => excludedTags.includes(tag));
    if (excluded === undefined) flows.push(file);
    else if (wanted.size > 0) problems.push(`${name} non gira qui: ha il tag ${excluded}.`);
  }
  if (flows.length === 0 && problems.length === 0) problems.push('Nessun flusso da eseguire.');
  return { flows, problems };
}

// The key as a header value: anything but a well-formed secret key is refused before it
// reaches fetch, whose errors would repeat the value.
export function checkSecretKey(value) {
  const key = value?.trim();
  return key && /^sb_secret_[A-Za-z0-9_-]+$/.test(key) ? key : null;
}

// generate_link signs up an unknown address, so the e2e user must already exist and be
// confirmed: a typo in TARA_E2E_EMAIL must not create an account.
export function pickE2eUser(users, wanted) {
  const confirmed = users.filter((user) => user.email && user.email_confirmed_at);
  if (wanted) {
    const match = confirmed.find((user) => user.email.toLowerCase() === wanted.trim().toLowerCase());
    if (!match) throw new Error('TARA_E2E_EMAIL non corrisponde a nessun utente confermato di Supabase.');
    return match.email;
  }
  const matches = confirmed.filter((user) => user.email.includes('+e2e@'));
  if (matches.length !== 1) {
    throw new Error(
      `Utenti confermati con "+e2e@" in Supabase: ${matches.length}. Imposta TARA_E2E_EMAIL.`,
    );
  }
  return matches[0].email;
}
