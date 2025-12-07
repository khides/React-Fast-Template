from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import Location, MyList
from app.db.session import get_db
from app.schemas.my_list import (
    LocationCreate,
    LocationReorder,
    LocationResponse,
    MyListCreate,
    MyListResponse,
    MyListUpdate,
)

router = APIRouter()


# MyList endpoints
@router.get("", response_model=list[MyListResponse])
def list_my_lists(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
) -> list[MyList]:
    """Get all lists with their locations."""
    lists = (
        db.query(MyList)
        .order_by(MyList.updated_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return lists


@router.post("", response_model=MyListResponse, status_code=201)
def create_my_list(list_in: MyListCreate, db: Session = Depends(get_db)) -> MyList:
    """Create a new list."""
    my_list = MyList(**list_in.model_dump())
    db.add(my_list)
    db.commit()
    db.refresh(my_list)
    return my_list


@router.get("/{list_id}", response_model=MyListResponse)
def get_my_list(list_id: int, db: Session = Depends(get_db)) -> MyList:
    """Get a specific list by ID."""
    my_list = db.query(MyList).filter(MyList.id == list_id).first()
    if not my_list:
        raise HTTPException(status_code=404, detail="List not found")
    return my_list


@router.put("/{list_id}", response_model=MyListResponse)
def update_my_list(
    list_id: int, list_in: MyListUpdate, db: Session = Depends(get_db)
) -> MyList:
    """Update a list."""
    my_list = db.query(MyList).filter(MyList.id == list_id).first()
    if not my_list:
        raise HTTPException(status_code=404, detail="List not found")

    update_data = list_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(my_list, field, value)

    db.commit()
    db.refresh(my_list)
    return my_list


@router.delete("/{list_id}", status_code=204)
def delete_my_list(list_id: int, db: Session = Depends(get_db)) -> None:
    """Delete a list and all its locations."""
    my_list = db.query(MyList).filter(MyList.id == list_id).first()
    if not my_list:
        raise HTTPException(status_code=404, detail="List not found")

    db.delete(my_list)
    db.commit()


# Location endpoints within a list
@router.post("/{list_id}/locations", response_model=LocationResponse, status_code=201)
def add_location_to_list(
    list_id: int, location_in: LocationCreate, db: Session = Depends(get_db)
) -> Location:
    """Add a location to a list."""
    my_list = db.query(MyList).filter(MyList.id == list_id).first()
    if not my_list:
        raise HTTPException(status_code=404, detail="List not found")

    # Get the next order index
    max_order = (
        db.query(Location)
        .filter(Location.my_list_id == list_id)
        .count()
    )

    location = Location(
        **location_in.model_dump(),
        my_list_id=list_id,
        order_index=max_order,
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


@router.delete("/{list_id}/locations/{location_id}", status_code=204)
def remove_location_from_list(
    list_id: int, location_id: int, db: Session = Depends(get_db)
) -> None:
    """Remove a location from a list."""
    location = (
        db.query(Location)
        .filter(Location.id == location_id, Location.my_list_id == list_id)
        .first()
    )
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    db.delete(location)
    db.commit()


@router.put("/{list_id}/locations/reorder", response_model=list[LocationResponse])
def reorder_locations(
    list_id: int, reorder_in: LocationReorder, db: Session = Depends(get_db)
) -> list[Location]:
    """Reorder locations within a list."""
    my_list = db.query(MyList).filter(MyList.id == list_id).first()
    if not my_list:
        raise HTTPException(status_code=404, detail="List not found")

    # Get all locations for this list
    locations = db.query(Location).filter(Location.my_list_id == list_id).all()
    location_map = {loc.id: loc for loc in locations}

    # Validate all location IDs exist
    for loc_id in reorder_in.location_ids:
        if loc_id not in location_map:
            raise HTTPException(
                status_code=400, detail=f"Location {loc_id} not found in list"
            )

    # Update order indices
    for index, loc_id in enumerate(reorder_in.location_ids):
        location_map[loc_id].order_index = index

    db.commit()

    # Return locations in new order
    return (
        db.query(Location)
        .filter(Location.my_list_id == list_id)
        .order_by(Location.order_index)
        .all()
    )
