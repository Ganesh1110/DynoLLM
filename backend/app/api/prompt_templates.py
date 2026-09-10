"""Prompt Templates API routes — CRUD for reusable benchmark prompt templates."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.prompt_template import PromptTemplate
from app.schemas.prompt_template import PromptTemplateCreate, PromptTemplateUpdate, PromptTemplateOut

router = APIRouter(prefix="/api/prompt-templates", tags=["prompt-templates"])


@router.get("", response_model=list[PromptTemplateOut])
async def list_prompt_templates(db: AsyncSession = Depends(get_db)):
    """List all prompt templates, ordered by builtin first, then created_at desc."""
    result = await db.execute(
        select(PromptTemplate).order_by(
            PromptTemplate.is_builtin.desc(),
            PromptTemplate.created_at.desc(),
        )
    )
    return result.scalars().all()


@router.post("", response_model=PromptTemplateOut)
async def create_prompt_template(
    data: PromptTemplateCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new custom prompt template."""
    template = PromptTemplate(
        name=data.name.strip(),
        description=data.description.strip() if data.description else None,
        scenario=data.scenario or "custom",
        system_prompt=data.system_prompt.strip() if data.system_prompt else None,
        prompt=data.prompt.strip(),
        temperature=data.temperature,
        max_tokens=data.max_tokens,
        is_builtin=False,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.get("/{template_id}", response_model=PromptTemplateOut)
async def get_prompt_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a prompt template by ID."""
    result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    return template


@router.put("/{template_id}", response_model=PromptTemplateOut)
async def update_prompt_template(
    template_id: str,
    data: PromptTemplateUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a custom prompt template. Built-in templates cannot be modified."""
    result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    if template.is_builtin:
        raise HTTPException(status_code=400, detail="Built-in templates cannot be edited. Save as a new custom template instead.")

    for field, val in data.model_dump(exclude_unset=True).items():
        if val is not None and isinstance(val, str):
            val = val.strip()
        setattr(template, field, val)

    template.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}")
async def delete_prompt_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a custom prompt template. Built-in templates cannot be deleted."""
    result = await db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    if template.is_builtin:
        raise HTTPException(status_code=400, detail="Built-in templates cannot be deleted.")

    await db.delete(template)
    await db.commit()
    return {"deleted": True, "id": template_id}
