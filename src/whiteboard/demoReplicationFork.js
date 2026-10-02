// Milestone 1 demo: a replication fork drawn in 7 steps, with matching narration,
// in English and French (see demoFor). Pure data (shared by the server, which
// validates it, and the tests).

const FORK = { type: 'replicationFork', x: 60, y: 50, width: 880, height: 470, sequence: 'TACGGATC', forkAt: 0.45, fragments: 3 };

function build(lang, title, heading, texts) {
  const fork = (...parts) => ({ ...FORK, ...(lang !== 'en' && { lang }), parts });
  const ids = ['duplex', 'unwind', 'topo', 'ssb', 'leading', 'lagging', 'summary'];
  return {
    narration: ids.map((id, i) => ({ id, text: texts[i] })),
    spec: {
      title,
      steps: [
        { cue: 'duplex', elements: [{ type: 'text', x: 40, y: 34, text: heading, size: 34 }, fork('duplex')] },
        { cue: 'unwind', elements: [fork('templates', 'helicase')] },
        { cue: 'topo', elements: [fork('topoisomerase')] },
        { cue: 'ssb', elements: [fork('ssb')] },
        { cue: 'leading', elements: [fork('leading')] },
        { cue: 'lagging', elements: [fork('lagging')] },
        { cue: 'summary', elements: [fork('labels')] },
      ],
    },
  };
}

const DEMOS = {
  en: build('en', 'DNA replication fork', 'DNA replication', [
    'Here is a stretch of double-stranded DNA. The two strands are antiparallel: the top one runs three prime to five prime, the bottom one five prime to three prime. And every base is paired: A with T, G with C.',
    'Replication starts at a fork. Helicase, this ring right here, unwinds the double helix and pulls the two template strands apart.',
    'Unwinding over-twists the DNA ahead of the fork. Topoisomerase relieves that strain by cutting and rejoining the strands.',
    'Single-strand binding proteins coat the exposed template, so it cannot snap back or fold on itself.',
    'DNA polymerase only builds a strand from five prime to three prime. On the top template, that direction points toward the fork, so the leading strand is made in one continuous piece.',
    'The bottom template runs the other way. So the lagging strand is made in short Okazaki fragments, each started by an RNA primer, each growing away from the fork.',
    'So, as the fork moves: one continuous leading strand, one lagging strand in fragments, and both always built five prime to three prime.',
  ]),
  fr: build('fr', "Fourche de réplication de l'ADN", "Réplication de l'ADN", [
    "Voici un segment d'ADN double brin. Les deux brins sont antiparallèles : celui du haut va de trois prime vers cinq prime, celui du bas de cinq prime vers trois prime. Et chaque base est appariée : A avec T, G avec C.",
    "La réplication commence au niveau d'une fourche. L'hélicase, cet anneau juste ici, déroule la double hélice et sépare les deux brins matrices.",
    "En se déroulant, l'ADN se surenroule en avant de la fourche. La topoisomérase relâche cette tension en coupant puis en ressoudant les brins.",
    "Des protéines SSB recouvrent la matrice exposée, pour qu'elle ne se referme pas et ne se replie pas sur elle-même.",
    "L'ADN polymérase ne construit un brin que de cinq prime vers trois prime. Sur la matrice du haut, ce sens pointe vers la fourche : le brin précoce est donc synthétisé d'un seul tenant.",
    "La matrice du bas va dans l'autre sens. Le brin tardif est donc synthétisé en courts fragments d'Okazaki, chacun démarré par une amorce d'ARN, et chacun s'allongeant en s'éloignant de la fourche.",
    "Ainsi, pendant que la fourche avance : un brin précoce continu, un brin tardif en fragments, et les deux toujours synthétisés de cinq prime vers trois prime.",
  ]),
};

/** The demo in `lang` ('en' or 'fr'; anything else gives English). */
export const demoFor = (lang) => DEMOS[lang] ?? DEMOS.en;

// English exports, used by the tests.
export const { narration, spec } = DEMOS.en;
