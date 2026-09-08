FROM freeradius/freeradius-server:latest

COPY clients.conf /etc/freeradius/clients.conf
COPY authorize /etc/freeradius/mods-config/files/authorize

RUN chmod 640 /etc/freeradius/clients.conf /etc/freeradius/mods-config/files/authorize && \
    chown root:freerad /etc/freeradius/clients.conf /etc/freeradius/mods-config/files/authorize

CMD ["freeradius", "-f", "-l", "stdout"]
