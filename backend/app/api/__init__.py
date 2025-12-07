from fastapi import APIRouter

from app.api.endpoints import items, my_lists

router = APIRouter()

router.include_router(items.router, prefix="/items", tags=["items"])
router.include_router(my_lists.router, prefix="/my-lists", tags=["my-lists"])
