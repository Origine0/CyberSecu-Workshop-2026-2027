# Image de base du moteur de remédiation : Python + Ansible + client PostgreSQL.
# Le moteur de remédiation est construit à partir de celle-ci (FROM resilience/ansible-runner:1.0).
FROM python:3.12.11-alpine3.22

RUN apk add --no-cache postgresql16-client \
 && pip install --no-cache-dir ansible-core==2.21.5

# Ansible a besoin d'un HOME inscriptible, /tmp est un tmpfs dans le compose
ENV HOME=/tmp \
    ANSIBLE_CONFIG=/ansible/ansible.cfg \
    ANSIBLE_LOCAL_TEMP=/tmp/.ansible/local \
    ANSIBLE_REMOTE_TMP=/tmp/.ansible/tmp \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

USER 65534:65534
WORKDIR /ansible
