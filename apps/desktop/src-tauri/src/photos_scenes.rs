//! Catalogue des scènes des photos de situation et construction des consignes données à Qwen Image Edit.
//!
//! Tout ce qui est ici vient des séries de test validées sur le PC du joueur (séries 2 à 4, étape 1) : vocabulaire
//! (« soccer », jamais « football »), lieux, lumières, angles, regard imposé par scène, phrase de fin sans texte ni
//! logo, et les questions oui/non que la porte qualité (`fmi_photos.py gate`) pose à chaque candidat.
//! Le tirage (lieu, lumière, angle, maillot) ne dépend que de la graine : même graine, même consigne.

use serde::Serialize;

/// Qui est sur la photo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    /// Un joueur (image 1 = son portrait).
    Player,
    /// Le coach (image 1 = sa photo).
    Coach,
    /// Coach et joueur ensemble (image 1 = coach, image 2 = joueur, image 3 = croquis de composition).
    Duo,
    /// « Une » de la gazette, 1280x720 (joueur ou coach).
    Front,
}

/// Croquis de composition donné au modèle en dernière image (dessiné par `fmi_photos.py sketch`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Sketch {
    Civiere,
    Duo,
}

/// Question posée par la porte qualité : réponse attendue et seuil sur la probabilité de cette réponse.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Question {
    pub id: &'static str,
    pub text: &'static str,
    pub expected: bool,
    pub threshold: f32,
}

const fn q(id: &'static str, text: &'static str, expected: bool) -> Question {
    Question { id, text, expected, threshold: 0.5 }
}
const fn qt(id: &'static str, text: &'static str, expected: bool, threshold: f32) -> Question {
    Question { id, text, expected, threshold }
}

/// Lieu : clé, description, intérieur (pas de météo).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Place {
    pub key: &'static str,
    pub text: &'static str,
    pub indoor: bool,
}

const fn place(key: &'static str, text: &'static str) -> Place {
    Place { key, text, indoor: false }
}
const fn indoor(key: &'static str, text: &'static str) -> Place {
    Place { key, text, indoor: true }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Scene {
    pub key: &'static str,
    pub role: Role,
    /// Qui fournit le visage de l'image 1 (« player » ou « coach ») ; pour un duo, image 1 = coach, image 2 = joueur.
    pub faces: u8,
    pub sketch: Option<Sketch>,
    pub width: u32,
    pub height: u32,
    pub places: &'static [Place],
    pub angles: &'static [&'static str],
    /// Où regarde le sujet (évite les poses face caméra).
    pub gaze: &'static str,
    /// Action, avec `{shirt}` pour le maillot tiré au sort (joueur) ; les scènes de coach portent le survêtement.
    pub action: &'static str,
    /// Ajoute un but au fond (seules les scènes où il est demandé en parlent).
    pub goal: bool,
    pub questions: &'static [Question],
    /// Scène de blessure : jamais avec la photo du coach.
    pub injury: bool,
}

// ------------------------------------------------------------------ vocabulaire validé

pub const END: &str = "Realistic photojournalism, natural skin texture, no text, no brand logos, no badges, plain kit. Keep his face identical.";
const END_KIT: &str = "Realistic photojournalism, natural skin texture, no text, no brand logos, no badges. Keep the face of the man from image 1 identical.";
const END_DUO: &str = "Image 3 is only a layout guide: do not draw its lines, shapes or white background. The two men are different people with different faces. \
Keep the face of the man from image 1 identical to image 1 and the face of the man from image 2 identical to image 2. \
Realistic photojournalism, natural skin texture, no text, no brand logos, no badges, plain clothes.";
const GOAL: &str = " In the background, a soccer goal with plain white goalposts and a white net.";
const TRACKSUIT: &str = "plain dark tracksuit";
/// Maillot d'après le kit du joueur (image 2) : couleurs et motif fidèles ; les logos sont traités ensuite.
pub const SHIRT_FROM_KIT: &str = "wearing exactly the shirt shown in image 2: same colours and pattern, but with no crest, no sponsor and no brand logo";
const KIT_NOTE: &str = " Image 2 only shows the shirt: do not draw the shirt on a flat background and do not copy any print from it.";
/// Consigne de la passe de nettoyage des logos (image 1 = la photo à nettoyer).
pub const CLEANUP: &str = "Remove every logo, badge, crest, sponsor text, brand mark and written word from the clothing and from the background of this photo, \
replacing each one with plain fabric or plain surface of the same colour and texture. Change absolutely nothing else: same people, same faces, same pose, same framing, same light.";

pub const SHIRTS: &[&str] = &["plain dark blue shirt with thin orange trim", "plain burgundy shirt with white collar", "plain sky blue shirt", "plain dark green shirt"];

/// Lumières extérieures : clé, texte.
pub const LIGHTS: &[(&str, &str)] = &[
    ("midi", "in harsh midday sun with hard shadows"),
    ("doree", "in golden late afternoon light"),
    ("nuit", "at night under floodlights"),
    ("pluie", "in fine rain with the ground glistening"),
    ("gris", "under a grey overcast sky"),
    ("brume", "in winter mist"),
];
const INDOOR_LIGHT: &str = "under artificial indoor lighting";

pub const ANGLES: &[(&str, &str)] = &[
    ("tele", "telephoto shot from the touchline with a blurred foreground"),
    ("plongee", "photographed from high up in the stands, camera looking down"),
    ("arriere", "three-quarter rear view"),
    ("cote", "side view, telephoto"),
    ("face", "front three-quarter view, telephoto"),
];

const STADIUMS: &[Place] = &[
    place("municipal", "at a small municipal soccer ground, one small covered stand behind"),
    place("moderne", "in a huge modern soccer stadium, steep full tiers of seats behind"),
    place("ancien", "in an old soccer stadium, weathered concrete terraces behind"),
    place("vide", "in an empty soccer stadium the day after a match, rows of empty seats behind"),
    place("entrainement", "on a soccer training ground, cones on the grass, a fence and trees behind"),
];
const STADIUMS_4: &[Place] = &[STADIUMS[0], STADIUMS[1], STADIUMS[2], STADIUMS[3]];
const TUNNEL: Place = indoor("tunnel", "in the players' tunnel leading from the dressing rooms to the pitch, painted corridor walls on both sides");
const TOUCHLINES: &[Place] = &[
    place("t_municipal", "on the touchline of a small municipal soccer ground, the dugout behind"),
    place("t_moderne", "on the touchline of a huge modern soccer stadium, the dugout and the lower tier of seats behind"),
    place("t_ancien", "on the touchline of an old soccer stadium, the dugout and weathered concrete terraces behind"),
];
const DUGOUTS: &[Place] = &[
    place("d_municipal", "in the dugout at a small municipal soccer ground, the dugout wall and a small covered stand behind him"),
    place("d_moderne", "in the dugout of a huge modern soccer stadium, padded dugout seats and the lower tier of the stand behind him"),
    place("d_ancien", "in the dugout of an old soccer stadium, a concrete wall behind him"),
    place("d_vide", "in the dugout of an empty soccer stadium the day after a match, rows of empty seats behind him"),
];
const OFFICES: &[Place] = &[
    indoor("bureau", "in a club office, a plain pale wall behind him"),
    indoor("salle", "in a meeting room with a large window, a view of an empty stand through it"),
    indoor("boiserie", "in a wood-panelled boardroom, plain panelling behind him"),
];
const PRESS: &[Place] = &[
    indoor("p_bleu", "in a press conference room, a plain dark blue backdrop behind him"),
    indoor("p_gris", "in a press conference room, a plain mid-grey backdrop behind him"),
    indoor("p_vert", "in a press conference room, a plain dark green backdrop behind him"),
];
const SUPPORTED_PLACES: &[Place] = &[STADIUMS[0], STADIUMS[1], STADIUMS[2], STADIUMS[3], STADIUMS[4], TUNNEL];
const CRUTCH_PLACES: &[Place] = &[TUNNEL, TOUCHLINES[0], TOUCHLINES[1], TOUCHLINES[2]];
const TOUCH_AND_STADIUMS: &[Place] = &[TOUCHLINES[0], TOUCHLINES[1], TOUCHLINES[2], STADIUMS[0], STADIUMS[1], STADIUMS[2]];

// ------------------------------------------------------------------ questions de la porte qualité

/// Posées à toutes les images.
pub const COMMON_QUESTIONS: &[Question] = &[
    q("texte", "Is there readable text or a brand logo anywhere in this picture?", false),
    q("boules", "Are there white balls floating near or stuck on goalposts?", false),
    q("poteau_jaune", "Are there yellow goalposts or American football uprights anywhere in this picture?", false),
];
const ALONE: Question = q("seul", "Is there exactly one person in this picture?", true);
const ODD_GOAL: Question = q("but_insolite", "Is there a soccer goal in an odd place, for example in the stands, right behind a bench, or on the touchline?", false);
const NO_GOAL: Question = q("but_present", "Is there a soccer goal with a net visible anywhere in this picture?", false);
const TWO_MEN: Question = q("deux", "Are exactly two men visible in this picture, and do they have two clearly different faces?", true);

// ------------------------------------------------------------------ scènes

pub const SCENES: &[Scene] = &[
    Scene {
        key: "civiere",
        role: Role::Player,
        faces: 1,
        sketch: Some(Sketch::Civiere),
        width: 1024,
        height: 576,
        places: STADIUMS,
        angles: &["cote"],
        gaze: "",
        action: "",
        goal: false,
        injury: true,
        questions: &[
            qt("tetes", "Are the heads of both people carrying the stretcher fully visible in the picture?", true, 0.12),
            qt("decollee", "Is the stretcher lifted off the ground?", true, 0.35),
            qt("trois", "Are there exactly 3 people in this picture?", true, 0.4),
            ODD_GOAL,
            NO_GOAL,
        ],
    },
    Scene {
        key: "soutenu",
        role: Role::Player,
        faces: 1,
        sketch: None,
        width: 1024,
        height: 576,
        places: SUPPORTED_PLACES,
        angles: &["tele", "arriere", "cote"],
        gaze: "He looks down at the ground, head tilted down.",
        action: "wearing a {shirt} and plain black shorts, limping badly, barely putting any weight on his right foot which drags behind, all his weight on the two medical staff holding him under the arms, grimacing, eyes half closed, the two medical staff wear plain black polo shirts and walk one on each side of him, the two medical staff are two other men, different faces from him and different from each other, one older and grey-haired, the other younger with dark hair",
        goal: false,
        injury: true,
        questions: &[
            q("pied_haut", "Is any foot raised high in the air, like a kick?", false),
            qt("trois", "Are there exactly 3 people in this picture?", true, 0.4),
            q("appui", "Is the man in the middle leaning his weight on the two people beside him?", true),
            ODD_GOAL,
            NO_GOAL,
        ],
    },
    Scene {
        key: "bequilles",
        role: Role::Player,
        faces: 1,
        sketch: None,
        width: 1024,
        height: 576,
        places: CRUTCH_PLACES,
        angles: &["tele", "arriere", "cote"],
        gaze: "He is looking at the ground two metres ahead while walking, head slightly down.",
        action: "wearing a {shirt} and plain black shorts, walking on two underarm crutches, exactly one crutch under each arm, a white bandage around his knee",
        goal: false,
        injury: true,
        questions: &[
            ALONE,
            q("deux_bequilles", "Is the man using two crutches, one under each arm?", true),
            q("lieu", "Is the background a soccer stadium or a stadium tunnel, not a plain photo studio?", true),
            ODD_GOAL,
            NO_GOAL,
        ],
    },
    Scene {
        key: "banc",
        role: Role::Player,
        faces: 1,
        sketch: None,
        width: 1024,
        height: 576,
        places: DUGOUTS,
        angles: &["tele", "cote", "plongee"],
        gaze: "He is looking down at his bandaged knee, eyes on the ice pack.",
        action: "wearing a {shirt} and plain black shorts, the only person in the picture, sitting on the dugout bench with one leg stretched straight out, a blue ice pack held on the knee with a white elastic bandage, soccer boots on his feet",
        goal: false,
        injury: true,
        questions: &[
            ALONE,
            q("glace", "Is there a blue ice pack on his knee?", true),
            q("assis", "Is he sitting on a bench?", true),
            q("but_derriere", "Is there a soccer goal right behind him?", false),
            NO_GOAL,
        ],
    },
    Scene {
        key: "glissade",
        role: Role::Player,
        faces: 1,
        sketch: None,
        width: 1024,
        height: 576,
        places: STADIUMS_4,
        angles: &["tele", "cote"],
        gaze: "He looks up, shouting, not at the camera.",
        action: "wearing a {shirt} and plain black shorts, sliding on both knees across the grass in a knee slide celebration, seen in profile from the side, torso leaning back, arms spread wide, shouting with joy",
        goal: true,
        injury: false,
        questions: &[ALONE, q("genoux", "Are his knees touching the ground?", true), q("glisse", "Is he sliding on his knees, not jumping?", true), ODD_GOAL],
    },
    Scene {
        key: "signature",
        role: Role::Player,
        faces: 1,
        sketch: None,
        width: 1024,
        height: 576,
        places: OFFICES,
        angles: &["face"],
        gaze: "He is looking down at the contract.",
        action: "wearing a {shirt}, sitting at a table and signing a contract with a pen",
        goal: false,
        injury: false,
        questions: &[ALONE, q("table", "Is he sitting at a table?", true), q("stylo", "Is he holding a pen and signing a document?", true)],
    },
    Scene {
        key: "consigne",
        role: Role::Coach,
        faces: 1,
        sketch: None,
        width: 1024,
        height: 576,
        places: TOUCHLINES,
        angles: &["tele", "cote", "arriere"],
        gaze: "He is looking at the players on the pitch, not at the camera.",
        action: "wearing a plain dark tracksuit, standing on the touchline with one arm stretched out, pointing and giving instructions, shouting",
        goal: true,
        injury: false,
        questions: &[q("geste", "Is he pointing or gesturing with an outstretched arm?", true), q("touche", "Is he standing at the edge of a soccer pitch?", true), ODD_GOAL],
    },
    Scene {
        key: "conference",
        role: Role::Coach,
        faces: 1,
        sketch: None,
        width: 1024,
        height: 576,
        places: PRESS,
        angles: &["face"],
        gaze: "He is looking at journalists off to one side, speaking.",
        action: "wearing a plain dark tracksuit jacket, sitting at a table at a press conference, two plain black microphones without any logo on the table in front of him, the backdrop has no text and no logos",
        goal: false,
        injury: false,
        questions: &[
            ALONE,
            q("table", "Is he sitting at a table with microphones in front of him?", true),
            q("panneau", "Is the wall or backdrop behind him plain, without any writing?", true),
        ],
    },
    Scene {
        key: "celebration",
        role: Role::Coach,
        faces: 1,
        sketch: None,
        width: 1024,
        height: 576,
        places: TOUCH_AND_STADIUMS,
        angles: &["tele", "cote"],
        gaze: "He is looking up at the stands, not at the camera.",
        action: "wearing a plain dark tracksuit, standing on the touchline, both arms raised high above his head with clenched fists, shouting with joy",
        goal: false,
        injury: false,
        questions: &[q("bras", "Are both of his arms raised up above his head?", true), ODD_GOAL, NO_GOAL],
    },
    Scene {
        key: "mains_tete",
        role: Role::Coach,
        faces: 1,
        sketch: None,
        width: 1024,
        height: 576,
        places: TOUCH_AND_STADIUMS,
        angles: &["tele", "cote"],
        gaze: "He is looking at the pitch in disbelief, not at the camera.",
        action: "wearing a plain dark tracksuit, standing on the touchline, both hands on top of his head, mouth half open, dismayed",
        goal: false,
        injury: false,
        questions: &[q("mains", "Are both of his hands on his head?", true), ODD_GOAL, NO_GOAL],
    },
    Scene {
        key: "duo_presse",
        role: Role::Duo,
        faces: 2,
        sketch: Some(Sketch::Duo),
        width: 1024,
        height: 576,
        places: PRESS,
        angles: &["face"],
        gaze: "Both men look toward the press photographers, smiling.",
        action: "Use image 3 as the composition guide: two men standing side by side. On the left, the man from image 1, wearing a plain dark suit and a white shirt. On the right, the man from image 2, wearing a plain dark tracksuit top. \
Together they hold up between them a {shirt} with no crest and no writing, each holding one shoulder of the shirt with one hand, and with their other hands they shake hands in front of it.",
        goal: false,
        injury: false,
        questions: &[
            TWO_MEN,
            q("maillot", "Are the two men holding up a soccer shirt together?", true),
            q("poignee", "Are the two men shaking hands?", true),
            q("panneau", "Is the wall or backdrop behind them plain, without any writing?", true),
        ],
    },
    Scene {
        key: "duo_accolade",
        role: Role::Duo,
        faces: 2,
        sketch: Some(Sketch::Duo),
        width: 1024,
        height: 576,
        places: TOUCHLINES,
        angles: &["face"],
        gaze: "",
        action: "Use image 3 as the composition guide: two men standing side by side. On the left, the man from image 1, wearing a plain dark tracksuit. On the right, the man from image 2, wearing a {shirt} and plain black shorts, sweaty after the match. \
The man from image 1 congratulates the man from image 2 after the match: they embrace, one arm around each other's shoulders, smiling broadly, both faces turned three-quarters toward the camera and clearly visible.",
        goal: false,
        injury: false,
        questions: &[
            TWO_MEN,
            q("accolade", "Are the two men embracing, with an arm around each other?", true),
            q("visages", "Are the faces of both men visible?", true),
            q("touche", "Are they at the edge of a soccer pitch?", true),
            NO_GOAL,
        ],
    },
    Scene {
        key: "une_joueur",
        role: Role::Front,
        faces: 1,
        sketch: None,
        width: 1280,
        height: 720,
        places: &[STADIUMS[1]],
        angles: &["tele"],
        gaze: "He is looking up at the crowd, not at the camera.",
        action: "wearing a {shirt} and plain black shorts, standing on the pitch in front of the packed stand after the victory, both arms raised high above his head with clenched fists, shouting with joy, \
steep full tiers of seats behind him filled with a blurred crowd, wide press shot from the touchline, telephoto lens, the man fills about half of the frame height, strong depth of field",
        goal: false,
        injury: false,
        questions: &[
            q("bras", "Are both of his arms raised up above his head?", true),
            q("tribune", "Is there a crowded stand behind him?", true),
            q("un_premier_plan", "Is there exactly one player in the foreground?", true),
            NO_GOAL,
        ],
    },
    Scene {
        key: "une_coach",
        role: Role::Front,
        faces: 1,
        sketch: None,
        width: 1280,
        height: 720,
        places: PRESS,
        angles: &["face"],
        gaze: "He is looking at journalists off to one side, speaking, serious expression.",
        action: "wearing a plain dark tracksuit jacket, sitting at a table at a post-match press conference, two plain black microphones without any logo on the table in front of him, the backdrop has no text and no logos",
        goal: false,
        injury: false,
        questions: &[
            ALONE,
            q("table", "Is he sitting at a table with microphones in front of him?", true),
            q("panneau", "Is the wall or backdrop behind him plain, without any writing?", true),
        ],
    },
];

pub fn scene(key: &str) -> Option<&'static Scene> {
    SCENES.iter().find(|s| s.key == key)
}

/// Les scènes qui attendent la photo du coach en image 1 (duos compris).
pub fn needs_coach(s: &Scene) -> bool {
    matches!(s.role, Role::Coach | Role::Duo) || s.key == "une_coach"
}

// ------------------------------------------------------------------ tirage

/// Générateur déterministe (splitmix64) : le tirage ne dépend que de la graine.
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng(seed)
    }
    pub fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    pub fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[(self.next() % items.len() as u64) as usize]
    }
}

/// Une consigne tirée pour un candidat.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Draw {
    pub seed: u64,
    pub prompt: String,
    pub place: &'static str,
    pub light: &'static str,
    pub angle: &'static str,
    pub shirt: String,
}

/// Construit la consigne du candidat `index` (0, 1, 2…) d'un tirage de base `base`.
/// Les lieux tournent d'un candidat à l'autre pour varier les trois images ; le reste est tiré de la graine.
/// `kit` : le maillot du joueur est fourni en image 2 (le croquis éventuel passe en image suivante).
pub fn draw(s: &Scene, base: u64, index: u32, kit: bool) -> Draw {
    let seed = base.wrapping_add(index as u64);
    let mut r = Rng::new(seed);
    let offset = (Rng::new(base).next() % s.places.len() as u64) as usize;
    let place = s.places[(offset + index as usize) % s.places.len()];
    let light = if place.indoor { ("interieur", INDOOR_LIGHT) } else { *r.pick(LIGHTS) };
    let angle_key = *r.pick(s.angles);
    let angle = ANGLES.iter().find(|(k, _)| *k == angle_key).map(|(_, t)| *t).unwrap_or(ANGLES[0].1);
    let shirt = if kit && s.role == Role::Player {
        SHIRT_FROM_KIT.to_string()
    } else if s.role == Role::Coach || s.key == "une_coach" {
        TRACKSUIT.to_string()
    } else {
        r.pick(SHIRTS).to_string()
    };
    let prompt = match (s.sketch, s.role) {
        (Some(Sketch::Civiere), _) => stretcher_prompt(place, light.1, &shirt, if kit { 3 } else { 2 }),
        (_, Role::Duo) => duo_prompt(s, place, light.1, angle, &shirt),
        _ => scene_prompt(s, place, light.1, angle, &shirt, kit),
    };
    Draw { seed, prompt, place: place.key, light: light.0, angle: angle_key, shirt }
}

fn scene_prompt(s: &Scene, place: Place, light: &str, angle: &str, shirt: &str, kit: bool) -> String {
    let subject = if kit { "the man from image 1" } else { "the same man" };
    let action = if kit { s.action.replace("wearing a {shirt}", shirt) } else { s.action.replace("{shirt}", shirt) };
    let mut parts = vec![format!("Turn this into a candid professional sports press photograph of {subject}, {action}, {}, {light}, {angle}.", place.text)];
    if s.goal {
        parts.push(GOAL.trim().to_string());
    }
    if !s.gaze.is_empty() {
        parts.push(s.gaze.to_string());
    }
    if kit {
        parts.push(KIT_NOTE.trim().to_string());
    }
    parts.push(if s.role == Role::Front { "Candid press photo, caught mid-action, front page of a newspaper, no headline, no writing on the picture.".to_string() } else { "Candid press photo, caught mid-action.".to_string() });
    parts.push(if kit { END_KIT } else { END }.to_string());
    parts.join(" ")
}

fn stretcher_prompt(place: Place, light: &str, shirt: &str, sketch_index: u8) -> String {
    let wear = if shirt == SHIRT_FROM_KIT { shirt.to_string() } else { format!("wears a {shirt}") };
    format!(
        "Use image {sketch_index} as the composition guide: wide shot, both medical staff fully visible from head to feet, carrying the stretcher by its handles at hip height, walking toward the touchline, \
the stretcher is lifted off the ground, the man from image 1 lies on it with one hand on his forehead, his face visible. He {wear} and plain black shorts. \
The two medical staff wear plain black polo shirts and are two other men, different faces from him and different from each other, one older and grey-haired, the other younger with dark hair. \
Side view, {}, {light}. Image {sketch_index} is only a layout guide: do not draw its lines, shapes or white background. Candid press photograph. {}",
        place.text,
        END.replace("his face", "the face of the man from image 1")
    )
}

fn duo_prompt(s: &Scene, place: Place, light: &str, angle: &str, shirt: &str) -> String {
    let shirt = format!("plain {} soccer shirt", shirt_colour(shirt));
    let gaze = if s.gaze.is_empty() { String::new() } else { format!(" {}", s.gaze) };
    format!("{}{gaze} {}, {light}, {angle}. Candid press photograph. {END_DUO}", s.action.replace("{shirt}", &shirt), place.text)
}

/// « plain dark green shirt » → « dark green » (le maillot d'un duo est décrit sans ses finitions).
fn shirt_colour(shirt: &str) -> &str {
    let s = shirt.strip_prefix("plain ").unwrap_or(shirt);
    s.split(" shirt").next().unwrap_or(s)
}

/// Les questions posées à une image de cette scène : les siennes puis les communes.
pub fn questions(s: &Scene) -> Vec<Question> {
    s.questions.iter().chain(COMMON_QUESTIONS).copied().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalogue_coherent() {
        assert_eq!(SCENES.len(), 14);
        let mut keys: Vec<&str> = SCENES.iter().map(|s| s.key).collect();
        keys.sort();
        keys.dedup();
        assert_eq!(keys.len(), SCENES.len(), "clés uniques");
        for s in SCENES {
            assert!(!s.places.is_empty() && !s.angles.is_empty(), "{}", s.key);
            for a in s.angles {
                assert!(ANGLES.iter().any(|(k, _)| k == a), "angle inconnu {a} dans {}", s.key);
            }
            assert_eq!(s.faces, if s.role == Role::Duo { 2 } else { 1 });
            assert!(!questions(s).is_empty());
            // jamais « football », toujours « soccer »
            let d = draw(s, 1000, 0, false);
            assert!(!d.prompt.to_lowercase().contains("football"), "{}: {}", s.key, d.prompt);
            assert!(d.prompt.contains("no brand logos"), "{}", s.key);
            assert!(!d.prompt.contains("{shirt}"), "{}: {}", s.key, d.prompt);
        }
    }

    #[test]
    fn tirage_deterministe_et_varie() {
        let s = scene("celebration").unwrap();
        let a = draw(s, 42, 0, false);
        let b = draw(s, 42, 0, false);
        assert_eq!(a, b);
        let c = draw(s, 42, 1, false);
        assert_ne!(a.seed, c.seed);
        assert_ne!(a.place, c.place, "les lieux tournent entre candidats");
        assert!(a.prompt.contains("plain dark tracksuit") && a.prompt.contains(END));
        assert!(a.prompt.contains("He is looking up at the stands"));
    }

    #[test]
    fn interieur_sans_meteo_et_but_seulement_si_demande() {
        let conf = draw(scene("conference").unwrap(), 7, 0, false);
        assert_eq!(conf.light, "interieur");
        assert!(conf.prompt.contains(INDOOR_LIGHT) && !conf.prompt.contains("goalposts"));
        let gl = draw(scene("glissade").unwrap(), 7, 0, false);
        assert!(gl.prompt.contains(GOAL.trim()));
        assert!(gl.prompt.contains("plain black shorts"));
    }

    #[test]
    fn kit_et_croquis() {
        let sig = draw(scene("signature").unwrap(), 3, 0, true);
        assert!(sig.prompt.contains(SHIRT_FROM_KIT) && sig.prompt.contains("the man from image 1") && sig.prompt.contains(KIT_NOTE.trim()));
        assert!(sig.prompt.ends_with(END_KIT));
        let civ = draw(scene("civiere").unwrap(), 3, 0, false);
        assert!(civ.prompt.starts_with("Use image 2 as the composition guide"));
        let civ_kit = draw(scene("civiere").unwrap(), 3, 0, true);
        assert!(civ_kit.prompt.starts_with("Use image 3 as the composition guide"));
        let duo = draw(scene("duo_accolade").unwrap(), 3, 0, false);
        assert!(duo.prompt.starts_with("Use image 3") && duo.prompt.ends_with(END_DUO));
        assert!(duo.prompt.contains("soccer shirt and plain black shorts"), "{}", duo.prompt);
    }

    #[test]
    fn une_et_questions() {
        let u = draw(scene("une_joueur").unwrap(), 5, 0, false);
        assert_eq!((scene("une_joueur").unwrap().width, scene("une_joueur").unwrap().height), (1280, 720));
        assert!(u.prompt.contains("front page of a newspaper, no headline"));
        let qs = questions(scene("banc").unwrap());
        assert_eq!(qs.len(), 5 + COMMON_QUESTIONS.len());
        assert_eq!(qs.last().unwrap().id, "poteau_jaune");
        assert!(needs_coach(scene("duo_presse").unwrap()) && needs_coach(scene("une_coach").unwrap()) && !needs_coach(scene("banc").unwrap()));
        assert!(scene("banc").unwrap().injury && !scene("glissade").unwrap().injury);
    }
}
