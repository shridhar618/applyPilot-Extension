"""Skill taxonomy + matcher.

A curated, deterministic taxonomy: canonical name -> (category, aliases). It covers common software /
data / AI skills and is intentionally NOT exhaustive. Skills outside it are not detected (documented limitation).
Ambiguous words ("go", "r", "c", "spark" as a verb) are deliberately handled via explicit aliases only.
"""
import re
from functools import lru_cache

# canonical: (category, [aliases]) -- canonical name itself is always an alias.
_RAW: dict[str, tuple[str, list[str]]] = {
    # languages
    "Python": ("language", ["python3"]), "Java": ("language", []), "JavaScript": ("language", ["js", "ecmascript", "es6"]),
    "TypeScript": ("language", ["ts"]), "C++": ("language", ["cpp"]), "C#": ("language", ["csharp", "c sharp"]),
    "Go": ("language", ["golang"]), "Rust": ("language", []), "Kotlin": ("language", []), "Swift": ("language", []),
    "PHP": ("language", []), "Ruby": ("language", []), "Scala": ("language", []), "R": ("language", ["r programming", "rstudio"]),
    "C": ("language", ["c programming"]), "SQL": ("language", ["t-sql", "pl/sql", "plsql"]), "Bash": ("language", ["shell scripting", "shell script"]),
    "HTML": ("language", ["html5"]), "CSS": ("language", ["css3"]), "MATLAB": ("language", []),
    # frontend
    "React": ("framework", ["react.js", "reactjs"]), "Next.js": ("framework", ["nextjs"]), "Vue": ("framework", ["vue.js", "vuejs"]),
    "Angular": ("framework", ["angularjs"]), "Redux": ("framework", []), "Tailwind CSS": ("framework", ["tailwind", "tailwindcss"]),
    "Svelte": ("framework", []),
    # backend
    "Node.js": ("framework", ["node", "nodejs"]), "Express": ("framework", ["express.js", "expressjs"]), "FastAPI": ("framework", []),
    "Django": ("framework", []), "Flask": ("framework", []), "Spring Boot": ("framework", ["springboot", "spring framework"]),
    ".NET": ("framework", ["dotnet", "asp.net", ".net core"]), "GraphQL": ("framework", []), "REST APIs": ("practice", ["rest api", "restful", "rest apis", "restful apis"]),
    "gRPC": ("framework", []), "Microservices": ("practice", ["microservice"]),
    # databases
    "PostgreSQL": ("database", ["postgres"]), "MySQL": ("database", []), "MongoDB": ("database", ["mongo"]),
    "Redis": ("database", []), "SQLite": ("database", []), "Elasticsearch": ("database", ["elastic search"]),
    "Cassandra": ("database", []), "DynamoDB": ("database", []), "Snowflake": ("database", []), "BigQuery": ("database", []),
    "Oracle": ("database", ["oracle db"]), "SQL Server": ("database", ["mssql", "ms sql"]),
    # cloud / devops
    "AWS": ("cloud", ["amazon web services"]), "Azure": ("cloud", ["microsoft azure"]), "GCP": ("cloud", ["google cloud", "google cloud platform"]),
    "Docker": ("devops", []), "Kubernetes": ("devops", ["k8s"]), "Terraform": ("devops", []), "Ansible": ("devops", []),
    "CI/CD": ("devops", ["cicd", "ci cd", "continuous integration", "continuous delivery", "continuous deployment"]),
    "GitHub Actions": ("devops", []), "Jenkins": ("devops", []), "Linux": ("devops", []), "Git": ("tool", ["github", "gitlab"]),
    "Nginx": ("devops", []), "Prometheus": ("devops", []), "Grafana": ("devops", []),
    # data engineering
    "Apache Spark": ("data", ["spark", "pyspark"]), "Kafka": ("data", ["apache kafka"]), "Airflow": ("data", ["apache airflow"]),
    "Hadoop": ("data", []), "dbt": ("data", []), "ETL": ("data", ["elt", "etl pipelines", "data pipelines", "data pipeline"]),
    "Data Warehousing": ("data", ["data warehouse", "data warehousing"]), "Databricks": ("data", []), "Power BI": ("data", ["powerbi"]),
    "Tableau": ("data", []), "Excel": ("data", ["microsoft excel", "ms excel"]), "Pandas": ("data", []), "NumPy": ("data", []),
    "Data Analysis": ("data", ["data analytics", "data analysis"]), "Data Visualization": ("data", ["data visualisation", "data visualization"]),
    "Statistics": ("data", ["statistical analysis"]), "A/B Testing": ("data", ["ab testing", "a/b tests", "a/b test"]),
    # AI / ML
    "Machine Learning": ("ai_ml", ["ml"]), "Deep Learning": ("ai_ml", []), "NLP": ("ai_ml", ["natural language processing"]),
    "Computer Vision": ("ai_ml", []), "PyTorch": ("ai_ml", []), "TensorFlow": ("ai_ml", []), "Keras": ("ai_ml", []),
    "scikit-learn": ("ai_ml", ["sklearn", "scikit learn"]), "LLMs": ("ai_ml", ["llm", "large language models", "large language model"]),
    "RAG": ("ai_ml", ["retrieval augmented generation", "retrieval-augmented generation"]), "LangChain": ("ai_ml", []),
    "LangGraph": ("ai_ml", []), "Hugging Face": ("ai_ml", ["huggingface", "transformers library"]), "OpenAI API": ("ai_ml", ["openai"]),
    "Prompt Engineering": ("ai_ml", []), "Vector Databases": ("ai_ml", ["vector database", "vector db", "pinecone", "chromadb", "faiss", "weaviate"]),
    "MLOps": ("ai_ml", ["mlflow", "kubeflow"]), "Generative AI": ("ai_ml", ["genai", "gen ai", "generative ai"]),
    "Reinforcement Learning": ("ai_ml", []), "Time Series": ("ai_ml", ["time series forecasting", "forecasting"]),
    # practices / tools
    "Agile": ("practice", ["scrum", "kanban"]), "Unit Testing": ("practice", ["unit tests", "unit testing", "tdd", "test-driven development"]),
    "pytest": ("tool", []), "Jest": ("tool", []), "Playwright": ("tool", []), "Selenium": ("tool", []), "Cypress": ("tool", []),
    "Jira": ("tool", []), "Figma": ("tool", []), "Postman": ("tool", []), "System Design": ("practice", ["distributed systems", "system design"]),
    "Data Structures": ("practice", ["data structures and algorithms", "dsa", "algorithms"]), "OOP": ("practice", ["object-oriented", "object oriented", "oop"]),
    "Web Scraping": ("practice", ["beautifulsoup", "scrapy"]), "OAuth": ("practice", ["oauth2", "jwt"]), "Cybersecurity": ("practice", ["information security", "infosec"]),
}

SOFT_SKILLS = {
    "Communication": ["communication skills", "communicate effectively", "verbal and written"],
    "Teamwork": ["team player", "teamwork", "collaborat"],
    "Problem Solving": ["problem solving", "problem-solving", "analytical skills", "analytical thinking"],
    "Leadership": ["leadership", "lead a team", "mentor"],
    "Ownership": ["ownership", "self-starter", "self starter", "proactive"],
    "Adaptability": ["adaptab", "fast-paced", "fast paced", "learn quickly", "quick learner"],
    "Time Management": ["time management", "prioritiz"],
}

_WORD_L = r"(?<![A-Za-z0-9+#.])"
_WORD_R = r"(?![A-Za-z0-9+#])(?!\.[A-Za-z0-9])"


@lru_cache(maxsize=1)
def _compiled() -> list[tuple[str, re.Pattern]]:
    out = []
    for canon, (_, aliases) in _RAW.items():
        names = {canon.lower(), *[a.lower() for a in aliases]}
        # Single-letter / very ambiguous languages must be matched case-sensitively, see below.
        pattern = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
        out.append((canon, re.compile(_WORD_L + "(?:" + pattern + ")" + _WORD_R, re.I)))
    return out


# Skills whose bare name collides with ordinary words; require an explicit alias or programming-language context.
_CONTEXT_REQUIRED = {
    "R": re.compile(r"(?:\bR\b\s*(?:,|/|and|&)\s*(?:python|sql|sas)|(?:python|sql)\s*(?:,|/|and|&)\s*\bR\b|\bR programming\b|\bRStudio\b|\bin R\b|\(R\))", re.I),
    "C": re.compile(r"(?:\bC\s*(?:,|/)\s*C\+\+|C\+\+\s*(?:,|/)\s*C(?![\w+#])|\bC programming\b|\bembedded C\b|\blanguages?[^.\n]{0,40}\bC(?![\w+#]))"),
    "Go": re.compile(r"(?:\bgolang\b|\bGo\s*(?:,|/)\s*(?:python|java|rust|c\+\+)|(?:python|java|rust|c\+\+)\s*(?:,|/)\s*Go\b|\bGo\s+(?:developer|programming|language)\b|\bwriting Go\b)", re.I),
    "Swift": re.compile(r"(?:\bSwift\s*(?:,|/)\s*(?:objective-c|kotlin|ios)|\bSwift(?:UI)?\b[^.\n]{0,30}\b(?:ios|apple|xcode)\b|\b(?:ios|xcode)\b[^.\n]{0,30}\bSwift\b)", re.I),
    "Oracle": re.compile(r"\boracle\s*(?:db|database|sql|11g|12c|19c)\b|\bpl/?sql\b", re.I),
    "Node.js": None, "Express": None,
}
_CONTEXT_REQUIRED = {k: v for k, v in _CONTEXT_REQUIRED.items() if v is not None}
# "Express"/"Node"/"Spark"/"Swift" as plain words are common English; require tech context for bare matches.
_BARE_AMBIGUOUS = {"Express": re.compile(r"express(?:\.js|js)|node[^.\n]{0,20}express|express[^.\n]{0,20}(?:node|api|server|middleware|route)", re.I),
                   "Apache Spark": re.compile(r"pyspark|apache spark|spark\s*(?:sql|streaming|mllib|jobs?|clusters?)|(?:using|with|in|and|,|/)\s*spark\b|\bspark\s*(?:,|/|and)", re.I),
                   "Git": re.compile(r"\bgit\b|github|gitlab", re.I)}


def category_of(skill: str) -> str:
    return _RAW.get(skill, ("other", []))[0]


def find_skills(text: str) -> list[str]:
    """Return canonical skills found in text, in taxonomy order (deterministic)."""
    if not text:
        return []
    found = []
    for canon, rx in _compiled():
        if canon in _CONTEXT_REQUIRED:
            if _CONTEXT_REQUIRED[canon].search(text):
                found.append(canon)
            continue
        if not rx.search(text):
            continue
        if canon in _BARE_AMBIGUOUS and not _BARE_AMBIGUOUS[canon].search(text):
            continue
        found.append(canon)
    return found


def find_soft_skills(text: str) -> list[str]:
    low = text.lower()
    return [name for name, cues in SOFT_SKILLS.items() if any(c in low for c in cues)]
