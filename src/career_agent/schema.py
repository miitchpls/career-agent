"""Building blocks shared by the models and the AI prompts.

`Model` is the API's JSON shape (camelCase out, either case in). `obj` and `nullable` write
the JSON schemas the AI CLIs validate their answer against: written by hand rather than
generated, because both CLIs check them and OpenAI's strict mode wants every property
required (optional = nullable) and no extra keywords.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def obj(props: dict) -> dict:
    return {
        "type": "object",
        "properties": props,
        "required": list(props),
        "additionalProperties": False,
    }


def nullable(schema: dict) -> dict:
    return {"anyOf": [schema, {"type": "null"}]}


# The UI's languages, as the prompts name them.
LANGUAGE_NAMES = {"it": "Italian", "en": "English", "de": "German", "ko": "Korean"}
