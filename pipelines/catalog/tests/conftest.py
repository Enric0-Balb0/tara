from pydantic_ai import models

# Nessun test chiama un modello vero: costerebbe, sarebbe lento e non ripetibile.
models.ALLOW_MODEL_REQUESTS = False
