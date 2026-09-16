(() => {
    const params = new URLSearchParams(window.location.search);
    const latitude = Number(params.get('lat'));
    const longitude = Number(params.get('lon'));
    const zoom = Math.min(19, Math.max(2, Number(params.get('zoom')) || 16));
    const hasCoordinates = params.has('lat') && params.has('lon') &&
        Number.isFinite(latitude) && Number.isFinite(longitude) &&
        latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

    document.querySelectorAll('[data-guide-code]').forEach(link => {
        if (!hasCoordinates) return;
        const target = new URL(link.href, window.location.href);
        target.searchParams.set('lat', String(latitude));
        target.searchParams.set('lon', String(longitude));
        target.searchParams.set('zoom', String(zoom));
        link.href = target.href;
    });

    const editorLink = document.querySelector('[data-open-editor]');
    if (editorLink && hasCoordinates) {
        const locale = document.documentElement.lang || 'en';
        editorLink.href = `https://www.openstreetmap.org/edit?editor=id&locale=${encodeURIComponent(locale)}#map=${zoom}/${latitude}/${longitude}`;
        editorLink.hidden = false;
    }
})();
