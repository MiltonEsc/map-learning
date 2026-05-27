from fastapi import APIRouter, HTTPException

from api.schemas import RouteOut, RouteCreate, RouteUpdate
from data.repository import get_active_routes, get_route_by_id, create_route, update_route, delete_route
from data.database import SessionLocal

router = APIRouter(prefix="/routes", tags=["Rutas"])


@router.get("", response_model=list[RouteOut])
def list_routes():
    db = SessionLocal()
    try:
        return [RouteOut.model_validate(r) for r in get_active_routes(db)]
    finally:
        db.close()


@router.get("/{route_id}", response_model=RouteOut)
def get_route(route_id: int):
    db = SessionLocal()
    try:
        route = get_route_by_id(db, route_id)
        if not route:
            raise HTTPException(status_code=404, detail=f"Ruta {route_id} no encontrada")
        return RouteOut.model_validate(route)
    finally:
        db.close()


@router.post("", response_model=RouteOut, status_code=201)
def add_route(body: RouteCreate):
    db = SessionLocal()
    try:
        route = create_route(db, **body.model_dump())
        return RouteOut.model_validate(route)
    finally:
        db.close()


@router.patch("/{route_id}", response_model=RouteOut)
def edit_route(route_id: int, body: RouteUpdate):
    db = SessionLocal()
    try:
        updates = body.model_dump(exclude_unset=True)
        if not updates:
            raise HTTPException(status_code=400, detail="Sin campos para actualizar")
        route = update_route(db, route_id, **updates)
        if not route:
            raise HTTPException(status_code=404, detail=f"Ruta {route_id} no encontrada")
        return RouteOut.model_validate(route)
    finally:
        db.close()


@router.delete("/{route_id}", status_code=204)
def remove_route(route_id: int):
    db = SessionLocal()
    try:
        if not delete_route(db, route_id):
            raise HTTPException(status_code=404, detail=f"Ruta {route_id} no encontrada")
    finally:
        db.close()
