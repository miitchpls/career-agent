"""What the profile says, to tell a rephrasing from a new fact.

Shared by the profile review and the tailored CV: both let the AI reword the profile, and both
drop what brings in a number or a name (a product, a tool, a company) the profile doesn't
hold. A lighter cousin of career-ops' verify-cv-facts.mjs, which gates its CVs the same way.
"""

import itertools
import re
import unicodedata

from .profile import Profile

NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
# A word, keeping the punctuation that is part of a name: Node.js, C#, C++, CI/CD.
TOKEN = re.compile(r"[^\W_](?:[\w+#./-]*[\w+#])?")
_GERMAN = frozenset(
    ["und", "der", "die", "das", "mit", "für", "ist", "von", "bei", "wir"]
)
# Acronyms a translation spells differently: Italian UE/IA, German KI, French/Spanish UE/IA.
_ACRONYMS = {"ue": "eu", "ia": "ai", "ki": "ai", "onu": "un", "usa": "us"}


def norm(text: str) -> str:
    """Comparable text: case, Unicode forms and punctuation ignored."""
    text = unicodedata.normalize("NFKC", text).casefold()
    return " ".join(re.findall(r"\w+", text))


def has(known: str, needle: str) -> bool:
    """`needle` as whole words in the normalised `known` text."""
    n = norm(needle)
    return bool(n) and f" {n} " in f" {known} "


def texts(value) -> list[str]:
    """Every string and number in a dumped profile."""
    if isinstance(value, dict):
        return [s for v in value.values() for s in texts(v)]
    if isinstance(value, list):
        return [s for v in value for s in texts(v)]
    if isinstance(value, str):
        return [value]
    if isinstance(value, int | float) and not isinstance(value, bool):
        return [str(value)]
    return []


_COMMON = {
    "it": frozenset(
        ["il", "della", "per", "che", "con", "sono", "nel", "delle", "una", "dei"]
    ),
    "en": frozenset(
        ["the", "and", "with", "for", "from", "that", "our", "into", "was", "were"]
    ),
    "de": frozenset(
        ["und", "der", "die", "das", "mit", "für", "ist", "von", "bei", "wir"]
    ),
}


def guess_language(text: str) -> str | None:
    """ "ko" when most letters are Hangul, else the language whose common words are most
    frequent; None when there's nothing to go by."""
    letters = [c for c in text if c.isalpha()]
    if letters and sum("\uac00" <= c <= "\ud7a3" for c in letters) >= 0.3 * len(
        letters
    ):
        return "ko"
    words = norm(text).split()
    counts = {lang: sum(w in common for w in words) for lang, common in _COMMON.items()}
    best = max(counts, key=lambda lang: counts[lang])
    return best if counts[best] else None


def is_german(text: str) -> bool:
    """German capitalises every noun: there a capital letter doesn't mark a name."""
    return len(set(norm(text).split()) & _GERMAN) >= 3


# Words a keyword phrase can do without: "Cloud & DevOps" is "cloud devops".
_FILLER = frozenset(
    [
        "a",
        "an",
        "and",
        "or",
        "of",
        "the",
        "in",
        "on",
        "for",
        "with",
        "to",
        "by",
        "at",
        "as",
        "e",
        "o",
        "di",
        "del",
        "della",
        "per",
        "con",
        "il",
        "la",
        "und",
        "oder",
        "der",
        "die",
        "das",
        "mit",
        "für",
        "von",
    ]
)


def stem(word: str) -> str:
    """A light stem, enough to match "testing" with "test" and "developer" with
    "development"."""
    if len(word) > 4 and word.endswith("ies"):
        word = word[:-3] + "y"
    elif len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        word = word[:-1]
    for suffix in ("ment", "ing", "er", "ed"):
        if len(word) > len(suffix) + 3 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def _shape(text: str) -> frozenset[str]:
    """A text's stems, plus each pair of neighbours joined ("front end" -> "frontend")."""
    words = norm(text).split()
    return frozenset(
        [stem(w) for w in words] + [stem(a + b) for a, b in itertools.pairwise(words)]
    )


class Corpus:
    """Texts a keyword phrase can be found in: every word of it in one same text (a
    bullet, a skill, a sentence), stems and joined compounds allowed. "End-to-end
    testing" is in "End-to-end test automation"; "cloud-native architectures" isn't in a
    profile that says "cloud" in one place and "architecture" in another."""

    def __init__(self, items: list[str]) -> None:
        self._shapes = [
            _shape(sentence)
            for item in items
            for sentence in re.split(r"(?<=[.!?;])\s+|\n", item)
            if sentence.strip()
        ]

    def holds(self, phrase: str) -> bool:
        words = [w for w in norm(phrase).split() if w not in _FILLER]
        if not words:
            return False
        variants = [words] + [
            [*words[:i], words[i] + words[i + 1], *words[i + 2 :]]
            for i in range(len(words) - 1)
        ]
        return any(
            all(stem(w) in shape for w in v) for v in variants for shape in self._shapes
        )


class Known:
    """The profile's words and numbers."""

    def __init__(self, p: Profile) -> None:
        items = texts(p.dump())
        text = "\n".join(items)
        self.corpus = Corpus(items)
        self.words = norm(text)
        self.numbers = {n.replace(",", ".") for n in NUMBER.findall(text)}
        self.german = is_german(text)
        self.language = guess_language(text)

    def new_facts(
        self,
        text: str,
        german: bool | None = None,
        translated: bool = False,
    ) -> list[str]:
        """Numbers and names in `text` the profile doesn't hold. `german`: whether `text` is
        German (by default, whether the profile is). `translated`: `text` is in another
        language than the profile, so a capitalised word may be a translated place or title
        ("Milan", "Developer"): only names shaped like products count (FastAPI, C++, S3)."""
        german = self.german if german is None else german
        out = [
            n for n in NUMBER.findall(text) if n.replace(",", ".") not in self.numbers
        ]
        for sentence in re.split(r"(?<=[.!?:;])\s+|\n", text):
            for i, tok in enumerate(TOKEN.findall(sentence)):
                first = i == 0
                if translated:
                    if not is_name(tok, first=True, german=True):
                        continue
                elif not is_name(tok, first=first, german=german):
                    continue
                if not self.holds_name(tok):
                    out.append(tok)
        return list(dict.fromkeys(out))

    def holds_name(self, tok: str) -> bool:
        """The name, an inflection of it ("APIs", "Kafka's"), or an acronym the profile
        holds in another language ("UE" for "EU", "KI" for "AI")."""
        forms = [tok, re.sub(r"['\u2019]s$", "", tok)]
        if len(tok) > 2 and tok.endswith("s"):
            forms.append(tok[:-1])
        return any(has(self.words, f) for f in forms if f) or self._translated(tok)

    def _translated(self, tok: str) -> bool:
        """An acronym the profile holds in another language: "UE" for "EU", "KI" for "AI"."""
        english = _ACRONYMS.get(tok.casefold())
        return tok.isupper() and english is not None and has(self.words, english)


def is_name(tok: str, first: bool, german: bool) -> bool:
    if any(c.isdigit() for c in tok) or any(c in "+#./" for c in tok[1:]):
        return True  # C++, Node.js, S3, CI/CD
    if any(c.isupper() for c in tok[1:]):
        return True  # FastAPI, iOS, AWS
    return tok[0].isupper() and not first and not german  # Kubernetes mid-sentence
