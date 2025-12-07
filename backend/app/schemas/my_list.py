from datetime import datetime

from pydantic import BaseModel, ConfigDict


# Location schemas
class LocationBase(BaseModel):
    name: str
    address: str
    lat: float
    lng: float
    place_id: str | None = None


class LocationCreate(LocationBase):
    pass


class LocationResponse(LocationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    my_list_id: int
    order_index: int
    created_at: datetime


class LocationReorder(BaseModel):
    location_ids: list[int]


# MyList schemas
class MyListBase(BaseModel):
    name: str
    description: str = ""


class MyListCreate(MyListBase):
    pass


class MyListUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class MyListResponse(MyListBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    locations: list[LocationResponse] = []
