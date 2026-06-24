type SerializableCookie = {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
};

const isCookieExpired = (cookie: chrome.cookies.Cookie) => {
  if (!cookie.expirationDate) {
    return false;
  }

  return cookie.expirationDate * 1000 < Date.now();
};

const encodeSessionCookies = (cookies: SerializableCookie[]) =>
  btoa(
    JSON.stringify({
      cookies,
    }),
  );

const getAllCookies = (domain: string) =>
  new Promise<chrome.cookies.Cookie[]>((resolve) => {
    chrome.cookies.getAll(
      {
        domain,
      },
      (cookies) => {
        resolve(cookies ?? []);
      },
    );
  });

const serializeCookies = (cookies: chrome.cookies.Cookie[]) =>
  cookies.map(
    (cookie): SerializableCookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
    }),
  );

const extractSessionCookies = async (domain: string) => {
  const cookies = await getAllCookies(domain);
  const validCookies = cookies.filter((cookie) => !isCookieExpired(cookie));

  if (validCookies.length === 0) {
    return null;
  }

  const authCookie = validCookies.find((cookie) => cookie.name === 'li_at');
  if (!authCookie) {
    return null;
  }

  const rankedCookies = [...validCookies].sort((left, right) => {
    const leftPriority = left.name === 'li_at' ? 10 : left.name === 'JSESSIONID' ? 9 : 0;
    const rightPriority = right.name === 'li_at' ? 10 : right.name === 'JSESSIONID' ? 9 : 0;
    return rightPriority - leftPriority;
  });

  return encodeSessionCookies(serializeCookies(rankedCookies));
};

export const getLinkedInSession = async () => extractSessionCookies('linkedin.com');
