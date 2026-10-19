"""User-reviewed content is the authority for headings and practice text."""
from typing import Literal
from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator
from backend.topics import Lesson, build_lesson, local_plan, source_blocks


class ReviewBlock(BaseModel):
    text: str = Field(max_length=45000)
    kind: Literal['heading','body','equation','diagram','ignore'] = 'body'
    heading_level: int = Field(default=1,ge=1,le=2)


class ReviewedDocument(BaseModel):
    title: str = Field(min_length=1,max_length=200)
    blocks: list[ReviewBlock] = Field(min_length=1,max_length=3000)

    @field_validator('title')
    @classmethod
    def title_not_blank(cls,title):
        if not title.strip():
            raise ValueError('Give the document a title')
        return title.strip()

    @field_validator('blocks')
    @classmethod
    def bound_text(cls,blocks):
        if sum(len(block.text) for block in blocks)>45000:
            raise ValueError('Keep edited content below 45,000 characters')
        return blocks


def prepare_review(text:str,title:str)->ReviewedDocument:
    blocks=source_blocks(text)
    plan=local_plan(blocks)
    return ReviewedDocument(title=title[:200] or 'Untitled document',blocks=[ReviewBlock(text=text,kind=item['kind']) for text,item in zip(blocks,plan)])


def reviewed_lesson(document:ReviewedDocument)->Lesson:
    blocks=[];plan=[]
    for block in document.blocks:
        text=' '.join(block.text.split())
        if not text:
            continue
        if text.startswith('[Diagram/image') and block.kind=='body':
            raise HTTPException(422,'Image placeholders cannot be practiced as text. Mark them as Diagram or Exclude, or replace them with your own description.')
        plan.append({'id':len(blocks),'kind':block.kind,'new_topic':block.kind=='heading'})
        blocks.append(text)
    if not any(item['kind']=='body' for item in plan):
        raise HTTPException(422,'Add at least one paragraph marked Normal text before starting practice.')
    return build_lesson(blocks,plan,document.title,'manual')
