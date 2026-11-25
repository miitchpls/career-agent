"""The app's background workers, one of each: board searches, CV import, profile review,
fit scores and tailored CVs. The routes start and stop them; tests wait on them."""

from .profile import Importer
from .review import Reviewer
from .score import Scorer
from .scraper import Runner
from .tailor import Tailorer

runner = Runner()
importer = Importer()
reviewer = Reviewer()
scorer = Scorer()
tailorer = Tailorer()
